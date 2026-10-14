"""Register generated rest poses; never changes existing walking/work atlases."""
from pathlib import Path
import base64, hashlib, io, json
from PIL import Image

folder=Path(__file__).resolve().parent
image=Image.open(folder/'idle-original.png').convert('RGBA')
cells=[]
for i in range(4):
    cell=image.crop((i*image.width//4,0,(i+1)*image.width//4,image.height))
    cell.putalpha(cell.getchannel('A').point(lambda a:255 if a>=128 else 0))
    cells.append(cell.crop(cell.getbbox()))
# Same size helmet and boots across poses; sitting is shorter by anatomy.
factor=150/cells[0].height
sheet=Image.new('RGBA',(192*4,192))
frames=[]
for i,cell in enumerate(cells):
    frame=cell.resize((round(cell.width*factor),round(cell.height*factor)),Image.Resampling.LANCZOS)
    # Dim the bright blue helmet emitter/highlight, retaining its dark visor.
    px=frame.load()
    for y in range(min(frame.height,75)):
        for x in range(frame.width):
            r,g,b,a=px[x,y]
            if a and b>170 and b>r*1.8 and g>90:
                px[x,y]=(int(r*.48),int(g*.48),int(b*.48),a)
    x=(192-frame.width)//2;y=174-frame.height
    assert x>=0 and y>=0
    sheet.alpha_composite(frame,(i*192+x,y))
    frames.append({'pose':['neutral','seated','earth','stretch'][i],'bbox':list(sheet.crop((i*192,0,(i+1)*192,192)).getbbox()),'foot_anchor':[96,174]})
amber=sheet.copy();px=amber.load()
for y in range(192):
    for x in range(amber.width):
        r,g,b,a=px[x,y]
        if a and g>r*1.35 and b>r*1.25 and g>60 and y>80:
            px[x,y]=(min(255,int(g*1.3)),min(204,int(g*.83)),max(25,int(r*.6)),a)
data={}
for name,im in [('restTeal',sheet),('restAmber',amber)]:
    path=folder/(name+'.png');im.save(path)
    data[name]='data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()
(folder.parent/'availability-assets.js').write_text('window.LunarAvailabilityAssets='+json.dumps(data)+';\n')
preview=Image.new('RGBA',(768,384),'#ada7be');preview.alpha_composite(sheet);preview.alpha_composite(amber,(0,192));preview.convert('RGB').save(folder/'contact-sheet.png')
metadata={'source':'Built-in imagegen, 2026-10-14','master':'idle-original.png','master_sha256':hashlib.sha256((folder/'idle-original.png').read_bytes()).hexdigest(),'reference':'Existing unchanged approved Library board libfile_5ba266f111c08191aeb9f47b7ab6f7dc and frame-contact-sheet.png','logical_cell':[64,64],'scale':3,'frames':frames,'processing':'Alpha threshold, shared scale, foot baseline, emitter dimming, amber trim recolour. No generated work or walk frames replaced.'}
(folder/'manifest.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps(metadata))
