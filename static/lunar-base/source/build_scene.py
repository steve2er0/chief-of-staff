"""Bundle live projection with the unchanged synthetic scene on existing routes."""
from pathlib import Path

root=Path(__file__).resolve().parent.parent
source=root/'source'
pieces=[(source/name).read_text() for name in ['workshop-assets.js','workshop-demo.js','live-model.js','placement-model.js','placement-scene.js','live-view.js']]
demo=(source/'demo-scene.js').read_text()
guard="const lunarMode=new URLSearchParams(location.search).get('mode');\nif(lunarMode==='live'){window.LunarLiveView.mount();}else if(lunarMode==='placement'){window.LunarPlacement.mount();}else if(lunarMode==='workshop'){window.LunarLiveView.mount({demo:true});}else{\n"+demo+"\n}\n"
(root/'scene.js').write_text('\n'.join(pieces)+'\n'+guard)
(root/'lunar.css').write_text((source/'demo-styles.css').read_text()+'\n'+(source/'live-styles.css').read_text()+'\n'+(source/'placement-styles.css').read_text())
print('Built live/synthetic scene bundle using existing authenticated scene.js route.')
