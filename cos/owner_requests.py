"""Explicit owner requests; no prose inference or execution/permission approval."""
import copy
import re
from .safety import Invalid,bounded_text

REQUEST_SCHEMA={"type":"object","additionalProperties":False,"properties":{
    "version":{"type":"integer","enum":[1]},"revision":{"type":"integer","minimum":1,"maximum":1000000},
    "state":{"type":"string","enum":["needs_user","resolved"]},
    "items":{"type":"array","maxItems":10,"items":{"type":"object","additionalProperties":False,
        "properties":{"id":{"type":"string","pattern":"^[A-Za-z0-9_-]{1,80}$"},
                      "kind":{"type":"string","enum":["question","decision","approval"]},"text":{"type":"string","minLength":1,"maxLength":2000}},
        "required":["id","kind","text"]}}},"required":["version","revision","state","items"]}

def validate_requests(value):
    if not isinstance(value,dict) or set(value)!=set(REQUEST_SCHEMA['required']):raise Invalid('Invalid user_requests envelope')
    if type(value['version']) is not int or value['version']!=1 or type(value['revision']) is not int or not 1<=value['revision']<=1000000:raise Invalid('Invalid owner request version/revision')
    if value['state'] not in ('needs_user','resolved') or not isinstance(value['items'],list) or len(value['items'])>10:raise Invalid('Invalid owner request state/items')
    if (value['state']=='needs_user')!=bool(value['items']):raise Invalid('Pending requests need items; resolved requests need an empty list')
    ids=set();items=[]
    for item in value['items']:
        if not isinstance(item,dict) or set(item)!= {'id','kind','text'} or not isinstance(item['id'],str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',item['id']):raise Invalid('Invalid owner request item')
        if item['id'] in ids or item['kind'] not in ('question','decision','approval'):raise Invalid('Duplicate owner request ID or invalid kind')
        ids.add(item['id']);text=bounded_text(item['text'],'owner request',2000)
        items.append(dict(item,text=text))
    return dict(value,items=items)

def apply_request_update(record,value,at):
    """An omitted field never clears a request. Old/repeated revisions are inert."""
    try:new=validate_requests(value)
    except Invalid as error:record['user_requests_error']=str(error);return False
    old=record.get('user_requests')
    if old:
        old_contract={k:old.get(k) for k in REQUEST_SCHEMA['required']}
        if new['revision']<old.get('revision',0):return False
        if new['revision']==old.get('revision'):
            if new!=old_contract:record['user_requests_error']='Conflicting repeated owner request revision'
            return False
    record['user_requests']=dict(new,observed_at=at)
    record.pop('user_requests_error',None)
    return True

def sync_request_records(service,task):
    """Create exact, idempotently linked questions/decisions for existing CoS forms.

    Called only while persisting actual progress/completion, never by GET.
    A worker withdrawal does not become an owner answer or approval.
    """
    envelope=task.get('user_requests')
    if not envelope:return
    links=task.setdefault('user_request_links',{})
    active={i['id'] for i in envelope['items']}
    for item in envelope['items']:
        link=links.get(item['id'])
        if link and link['text']==item['text'] and link['kind']==item['kind']:
            rows=service.store.get('project',task['project_id'])['records']
            if any(r['id']==link['record_id'] and r['status']!='withdrawn' for r in rows):continue
        if link:
            old_project=service.store.get('project',task['project_id'])
            for old_row in old_project['records']:
                if old_row['id']==link['record_id'] and old_row['status'] in ('open','suggested'):
                    old_row.update(status='withdrawn',withdrawn_at=envelope['observed_at'],withdrawn_by='Superseded explicit request revision')
            service.store.put('project',old_project)
        record=service.record(task['project_id'],item['text'],'question' if item['kind']=='question' else 'decision',
            'Explicit '+item['kind']+' request from task '+task['id']+'; records owner context only, not execution permission')
        project=service.store.get('project',task['project_id'])
        row=next(r for r in project['records'] if r['id']==record['id'])
        row.update(user_request_task_id=task['id'],user_request_id=item['id'],user_request_kind=item['kind'])
        service.store.put('project',project)
        links[item['id']]={'record_id':record['id'],'text':item['text'],'kind':item['kind'],'revision':envelope['revision']}
    project=service.store.get('project',task['project_id']);changed=False
    for key,link in links.items():
        if key in active and envelope['state']=='needs_user':continue
        for row in project['records']:
            if row['id']==link['record_id'] and row['status'] in ('open','suggested'):
                row.update(status='withdrawn',withdrawn_at=envelope['observed_at'],withdrawn_by='Explicit worker request update');changed=True
    if changed:
        project['version']+=1
        project['updated']=envelope['observed_at']
        service.store.put('project',project)
        service.store.audit('owner_request.withdrawn',task['id'],'Explicit worker update; no owner answer or approval')

def owner_snapshot(record,project=None):
    """Pure presentation. Preserve raw lifecycle, records and legacy payloads."""
    result=dict(record);envelope=record.get('user_requests');items=[];state='none';source='missing';observed=None;revision=0
    warning=record.get('user_requests_error')
    if envelope:
        try:
            normalized=validate_requests({k:envelope.get(k) for k in REQUEST_SCHEMA['required']})
            state=normalized['state'];items=copy.deepcopy(normalized['items']);revision=normalized['revision'];observed=envelope.get('observed_at');source='structured'
        except Invalid:source='invalid';warning=warning or 'Owner request metadata is invalid'
    elif record.get('state') in ('blocked','failed','ready_for_review'):
        legacy=record.get('decisions_needed') or (record.get('result') or {}).get('decisions') or []
        if isinstance(legacy,list):
            items=[{'id':'legacy-'+str(i),'kind':'decision','text':v} for i,v in enumerate(legacy[:30]) if isinstance(v,str) and v.strip()]
            if items:state='needs_user';source='legacy_decisions';observed=record.get('updated');warning='Legacy owner-decision list; request type and explicit resolution signal were not supplied'
    if record.get('state') in ('accepted','superseded','cancelled'):state='none';items=[]
    rows={r['id']:r for r in (project or {}).get('records',[])}
    for item in items:
        link=record.get('user_request_links',{}).get(item['id'],{})
        row=rows.get(link.get('record_id'),{})
        item['record_id']=row.get('id');item['response_status']=row.get('status')
        item['answered']=row.get('status') in ('answered','approved','rejected')
        if row.get('answer'):item['owner_answer']=row['answer']
    result['owner_attention']={'version':1,'state':state,'source':source,'revision':revision,'observed_at':observed,'items':items,'warning':warning}
    return result
