/* Offline conversation math and explicit composer actions. No network or HTML input. */
(function(root,factory){
  'use strict';
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ConversationTools=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const GO_INSTRUCTION="Let's go! Please proceed with the work discussed in this conversation, using the current working folder and existing permissions.";
  const symbols={alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ϵ',varepsilon:'ε',zeta:'ζ',eta:'η',theta:'θ',vartheta:'ϑ',iota:'ι',kappa:'κ',lambda:'λ',mu:'μ',nu:'ν',xi:'ξ',pi:'π',varpi:'ϖ',rho:'ρ',varrho:'ϱ',sigma:'σ',varsigma:'ς',tau:'τ',upsilon:'υ',phi:'ϕ',varphi:'φ',chi:'χ',psi:'ψ',omega:'ω',Gamma:'Γ',Delta:'Δ',Theta:'Θ',Lambda:'Λ',Xi:'Ξ',Pi:'Π',Sigma:'Σ',Upsilon:'Υ',Phi:'Φ',Psi:'Ψ',Omega:'Ω',infty:'∞',partial:'∂',nabla:'∇',ell:'ℓ',hbar:'ℏ',Re:'ℜ',Im:'ℑ',emptyset:'∅',varnothing:'∅'};
  const operators={times:'×',cdot:'⋅',div:'÷',pm:'±',mp:'∓',le:'≤',leq:'≤',ge:'≥',geq:'≥',ne:'≠',neq:'≠',approx:'≈',sim:'∼',simeq:'≃',equiv:'≡',propto:'∝',to:'→',rightarrow:'→',leftarrow:'←',leftrightarrow:'↔',Rightarrow:'⇒',Leftarrow:'⇐',Leftrightarrow:'⇔',mapsto:'↦',in:'∈',notin:'∉',subset:'⊂',supset:'⊃',subseteq:'⊆',supseteq:'⊇',cup:'∪',cap:'∩',land:'∧',lor:'∨',neg:'¬',forall:'∀',exists:'∃',perp:'⊥',parallel:'∥',angle:'∠',degree:'°',ldots:'…',dots:'…',cdots:'⋯',vdots:'⋮',ddots:'⋱',langle:'⟨',rangle:'⟩',lvert:'|',rvert:'|',lVert:'‖',rVert:'‖',vert:'|',Vert:'‖',lbrace:'{',rbrace:'}',colon:':',mid:'|',setminus:'∖'};
  const large={sum:'∑',prod:'∏',coprod:'∐',int:'∫',iint:'∬',iiint:'∭',oint:'∮',bigcup:'⋃',bigcap:'⋂'};
  const functions=new Set(['sin','cos','tan','sec','csc','cot','arcsin','arccos','arctan','sinh','cosh','tanh','log','ln','exp','det','gcd','min','max','lim','sup','inf']);
  const tag=(name,body,attributes='')=>'<'+name+attributes+'>'+body+'</'+name+'>';
  // Deliberately bounded TeX subset to native MathML. Unknown/malformed syntax
  // falls back to the original escaped source; commands never become HTML.
  class MathParser{
    constructor(source,display){this.source=source;this.i=0;this.depth=0;this.nodes=0;this.display=display;}
    space(){while(/\s/.test(this.source[this.i]||'')&&this.i<this.source.length)this.i++;}
    groupText(){
      this.space();if(this.source[this.i++]!=='{')throw Error('Expected group');
      const start=this.i;let depth=1;
      while(this.i<this.source.length){const c=this.source[this.i++];if(c==='\\'){this.i++;continue;}if(c==='{')depth++;if(c==='}'&&!--depth)return this.source.slice(start,this.i-1);}
      throw Error('Unclosed group');
    }
    argument(){this.space();if(this.source[this.i]==='{'){this.i++;return tag('mrow',this.expression('}'));}return this.atom().html;}
    expression(stop=''){
      if(++this.depth>40)throw Error('Math nesting limit');const parts=[];
      while(this.i<this.source.length){
        this.space();if(this.i>=this.source.length)break;
        if(stop&&this.source[this.i]===stop){this.i++;this.depth--;return parts.join('');}
        if(this.source[this.i]==='}')throw Error('Unexpected brace');
        const atom=this.atom();let sub=null,sup=null;this.space();
        while(this.source[this.i]==='_'||this.source[this.i]==='^'){
          const kind=this.source[this.i++],arg=this.argument();if(kind==='_'){if(sub!==null)throw Error('Duplicate subscript');sub=arg;}else{if(sup!==null)throw Error('Duplicate superscript');sup=arg;}this.space();
        }
        const under=atom.large&&this.display,base=atom.html;
        parts.push(sub!==null&&sup!==null?tag(under?'munderover':'msubsup',base+sub+sup):sub!==null?tag(under?'munder':'msub',base+sub):sup!==null?tag(under?'mover':'msup',base+sup):base);
      }
      this.depth--;if(stop)throw Error('Unclosed group');return parts.join('');
    }
    atom(){
      if(++this.nodes>1800)throw Error('Math node limit');this.space();const c=this.source[this.i++];if(!c)throw Error('Expected expression');
      if(c==='{')return {html:tag('mrow',this.expression('}'))};
      if(c==='_'||c==='^')throw Error('Missing script base');
      if(c==='\\'){
        const match=this.source.slice(this.i).match(/^[a-zA-Z]+/),name=match?match[0]:this.source[this.i++];if(match)this.i+=name.length;
        if(symbols[name])return {html:tag('mi',symbols[name])};
        if(operators[name])return {html:tag('mo',operators[name])};
        if(large[name])return {html:tag('mo',large[name]),large:true};
        if(functions.has(name))return {html:tag('mi',name,' mathvariant="normal"'),large:['lim','min','max','sup','inf'].includes(name)};
        if(['frac','dfrac','tfrac','binom'].includes(name)){const a=this.argument(),b=this.argument();return {html:name==='binom'?tag('mrow',tag('mo','(')+tag('mfrac',a+b,' linethickness="0"')+tag('mo',')')):tag('mfrac',a+b)};}
        if(name==='sqrt'){this.space();let index=null;if(this.source[this.i]==='['){this.i++;index=this.expression(']');}const body=this.argument();return {html:index===null?tag('msqrt',body):tag('mroot',body+tag('mrow',index))};}
        if(['text','textrm','operatorname'].includes(name)){const text=this.groupText().replace(/\\([{}%_$&# ])/g,'$1');return {html:tag(name==='operatorname'?'mi':'mtext',escape(text),name==='operatorname'?' mathvariant="normal"':'')};}
        const variants={mathrm:'normal',mathbf:'bold',mathit:'italic',mathbb:'double-struck',mathcal:'script',mathscr:'script',mathsf:'sans-serif',mathtt:'monospace',boldsymbol:'bold-italic'};
        if(variants[name])return {html:tag('mstyle',this.argument(),' mathvariant="'+variants[name]+'"')};
        const accents={hat:'^',widehat:'^',bar:'¯',overline:'¯',vec:'→',dot:'˙',ddot:'¨',tilde:'~',widetilde:'~',underline:'_'};
        if(accents[name])return {html:tag(name==='underline'?'munder':'mover',this.argument()+tag('mo',accents[name]),' accent="true"')};
        if(['left','right','big','Big','bigg','Bigg'].includes(name)){this.space();if(this.source[this.i]==='.'){this.i++;return {html:''};}return this.atom();}
        if(['quad','qquad',',',';',':','!',' '].includes(name))return {html:'<mspace width="'+({quad:'1em',qquad:'2em','!':'0em'}[name]||'0.2em')+'"></mspace>'};
        if(['{','}','_','%','$','#','&','|'].includes(name))return {html:tag('mo',escape(name))};
        if(name==='begin')return this.matrix();
        throw Error('Unsupported command');
      }
      if(/[0-9.]/.test(c)){const rest=this.source.slice(this.i).match(/^[0-9.]*/)[0];this.i+=rest.length;return {html:tag('mn',escape(c+rest))};}
      return {html:tag(/[\p{L}]/u.test(c)?'mi':'mo',escape(c==='-'?'−':c))};
    }
    matrix(){
      const env=this.groupText();if(!['matrix','pmatrix','bmatrix','vmatrix','Vmatrix','aligned','cases'].includes(env))throw Error('Unsupported environment');
      const ending='\\end{'+env+'}',end=this.source.indexOf(ending,this.i);if(end<0)throw Error('Unclosed environment');
      const source=this.source.slice(this.i,end);this.i=end+ending.length;
      if(/\\(?:begin|end)\b/.test(source))throw Error('Nested environment');
      const rows=source.split(/\\\\(?:\[[^\]]*\])?/);if(rows.length>50)throw Error('Matrix limit');
      const table=tag('mtable',rows.map(row=>{const cells=row.split('&');if(cells.length>30)throw Error('Matrix limit');return tag('mtr',cells.map(cell=>tag('mtd',new MathParser(cell,this.display).expression())).join(''));}).join(''));
      const brackets={pmatrix:['(',')'],bmatrix:['[',']'],vmatrix:['|','|'],Vmatrix:['‖','‖'],cases:['{','']},pair=brackets[env];
      return {html:pair?tag('mrow',tag('mo',pair[0],' stretchy="true"')+table+(pair[1]?tag('mo',pair[1],' stretchy="true"'):'')):table};
    }
  }
  function mathHTML(source,display){
    if(!source.trim()||source.length>12000)return null;
    try{const body=new MathParser(source,display).expression();return '<math xmlns="http://www.w3.org/1998/Math/MathML" display="'+(display?'block':'inline')+'" aria-label="'+escape(source.trim())+'">'+body+'</math>';}catch{return null;}
  }
  function renderMessage(value,markdown){
    const text=String(value||''),math=[];let prepared='',i=0,marker='COSMATHSEGMENT';while(text.includes(marker))marker+='X';
    while(i<text.length){
      // Never substitute markup into Markdown URL attributes. Link/image spans
      // retain the existing renderer's scheme allowlist and escaped labels.
      const link=(text[i]==='['||text[i]==='!')&&text.slice(i).match(/^!?\[[^\]\n]+\]\([^\s)]+\)/);
      if(link){prepared+=link[0];i+=link[0].length;continue;}
      if(text[i]==='`'){
        let count=1;while(text[i+count]==='`')count++;const fence='`'.repeat(count),end=text.indexOf(fence,i+count);
        if(end<0){prepared+=text.slice(i);break;}prepared+=text.slice(i,end+count);i=end+count;continue;
      }
      const escaped=i>0&&text[i-1]==='\\'&&(i<2||text[i-2]!=='\\');
      const opener=!escaped&&(text.startsWith('\\[',i)?'\\[':text.startsWith('\\(',i)?'\\(':text.startsWith('$$',i)?'$$':text[i]==='$'&&!/\s/.test(text[i+1]||' ')?'$':'');
      if(!opener){prepared+=text[i++];continue;}
      const closer=({'\\[':'\\]','\\(':'\\)'})[opener]||opener,display=opener==='$$'||opener==='\\[';let end=i+opener.length;
      while((end=text.indexOf(closer,end))>=0){if(text[end-1]!=='\\'&&(closer!=='$'||!/[\s$]/.test(text[end-1])&&text[end+1]!=='$'))break;end+=closer.length;}
      // While a delimiter is still streaming, preserve it intact. In particular,
      // an unfinished $$ block must never become a stray $ plus inline math.
      if(end<0){prepared+=text.slice(i);break;}
      if(!display&&text.slice(i+opener.length,end).includes('\n')){prepared+=text[i++];continue;}
      const original=text.slice(i,end+closer.length),html=mathHTML(text.slice(i+opener.length,end),display);
      if(html){const token=marker+math.length+'END';math.push([token,html]);prepared+=token;}else prepared+=original;
      i=end+closer.length;
    }
    // A second boundary check keeps substitutions in text nodes even if the
    // deliberately small Markdown renderer gains more attribute-bearing syntax.
    return markdown(prepared).split(/(<[^>]*>)/g).map((part,index)=>{
      if(index%2)return part;for(const [token,equation] of math)part=part.split(token).join(equation);return part;
    }).join('');
  }
  function actionState(task,sending=false){
    const unavailable=!task||task.state==='superseded'||task.state==='stopping',attention=(task?.live_requests||[]).some(r=>['pending','sending'].includes(r.status))||task?.owner_attention?.state==='needs_user';
    const resumable=['ready_for_review','accepted','failed','blocked','paused','cancelled','interrupted'].includes(task?.state);
    return {submitDisabled:sending||unavailable,goDisabled:sending||unavailable||!resumable||attention};
  }
  function instruction(kind,draft,task){
    const text=String(draft||'').trim();if(kind==='go'){
      if(actionState(task).goDisabled)throw Error('Wait for this agent to finish and resolve any pending requests before continuing.');
      const message=GO_INSTRUCTION+(text?'\n\nAdditional instructions:\n'+text:'');
      if(message.length>6000)throw Error('Shorten the additional instructions to fit the message limit.');return message;
    }
    if(kind!=='submit')throw Error('Unknown composer action.');
    if(!text)throw Error('Write a message first, or use a suggestion to fill an editable draft.');
    if(actionState(task).submitDisabled)throw Error('Wait for the agent and its tools to stop before sending.');return text;
  }
  function enterSubmits(event,composing=false){return event.key==='Enter'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing&&!composing&&event.keyCode!==229&&!event.repeat&&!event.defaultPrevented;}
  return Object.freeze({renderMessage,mathHTML,actionState,instruction,enterSubmits});
});
