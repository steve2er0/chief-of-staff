"""Build the live workspace. Scripted demos remain local development fixtures."""
from pathlib import Path

root=Path(__file__).resolve().parent.parent
source=root/'source'
pieces=[(root.parent/'agent-model.js').read_text()]+[(source/name).read_text() for name in ['attention-assets.js','attention-model.js','workshop-assets.js','display-assets.js','base-layout.js','live-model.js','live-view.js']]
guard="if(!document.body.dataset.agentWorkspace){window.LunarLiveView.mount();}\n"
(root/'scene.js').write_text('\n'.join(pieces)+'\n'+guard)
(root/'lunar.css').write_text((source/'demo-styles.css').read_text()+'\n'+(source/'live-styles.css').read_text()+'\n'+(source/'placement-styles.css').read_text())

def scope_css(text):
    """Scope existing map styles without leaking demo typography into panels."""
    import re
    text=re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    result=''
    while text.strip():
        head,body=text.split('{',1)
        depth=1
        for end,char in enumerate(body):
            depth+= (char=='{')-(char=='}')
            if depth==0:break
        content=body[:end]
        if head.strip().startswith('@'):
            result+=head+'{'+scope_css(content)+'}'
        else:
            selectors=[]
            for selector in head.split(','):
                selector=selector.strip().replace('body[data-lunar-mode=live]', '').strip()
                selectors.append('#lunar-host' if selector in (':root','body','') else '#lunar-host '+selector)
            result+=','.join(selectors)+'{'+content+'}'
        text=body[end+1:]
    return result

(root/'workspace.css').write_text(scope_css((source/'demo-styles.css').read_text())+'\n'+scope_css((source/'live-styles.css').read_text())+'\n'+(source/'workspace-styles.css').read_text())
print('Built live scene and scoped workspace styles.')
