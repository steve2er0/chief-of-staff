"""Early artwork review: actual asset cutouts and actual registered pose frames."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parent
if root.name=='source':root=root.parent
evidence=root/'evidence';evidence.mkdir(exist_ok=True)
font_path='/System/Library/Fonts/Supplemental/Arial.ttf'
font=lambda n:ImageFont.truetype(font_path,n)
def canvas():
 im=Image.new('RGB',(1280,1130),'#0d1425');d=ImageDraw.Draw(im)
 d.text((36,24),'LUNAR BASE · WORKSHOP ASSET KIT',font=font(30),fill='#e9e5de')
 d.text((36,65),'Actual generated sprites and registered frames · artwork preview, not a game capture',font=font(17),fill='#8fc4ce')
 for i,(name,label) in enumerate([('lander','FLIGHT DATA · LANDER'),('hologram','ANALYSIS · MODEL PLATFORM'),('teststand','TEST DATA · TEST STAND')]):
  asset=Image.open(root/'assets'/(name+'.png')).convert('RGBA');x=25+i*316
  d.rounded_rectangle((x,109,x+296,402),radius=8,fill='#192239',outline='#37465f')
  im.paste(asset,(x+(296-asset.width)//2,125+(245-asset.height)),asset)
  d.text((x+12,377),label,font=font(14),fill='#d9e0e8')
 x=25+3*316;d.rounded_rectangle((x,109,x+296,402),radius=8,fill='#192239',outline='#37465f')
 habitat=Image.open('/Users/stephenwells/Documents/DevOps/chief-of-staff/static/lunar-base/assets/habitat.png').convert('RGBA').resize((266,165),Image.Resampling.NEAREST)
 console=Image.open('/Users/stephenwells/Documents/DevOps/chief-of-staff/static/lunar-base/assets/console.png').convert('RGBA').resize((60,66),Image.Resampling.NEAREST)
 im.paste(habitat,(x+15,168),habitat);im.paste(console,(x+4,278),console)
 d.text((x+12,377),'MISC · HABITAT + EXTERIOR CONSOLE',font=font(12),fill='#d9e0e8')
 for row,label in enumerate(['ASSEMBLY / HAMMERING','LASER SCANNING','WELDING','SENSOR ATTACHMENT','TABLET INSPECTION']):
  y=432+row*132;d.text((36,y+42),label,font=font(18),fill='#d8e4e9')
  d.text((36,y+69),'Registered head + boot anchors',font=font(12),fill='#8499b0')
 return im

work=Image.open(root/'assets/astronaut-work-teal.png').convert('RGBA')
sheet=canvas()
for row in range(5):
 for col in range(4):
  frame=work.crop((col*96,row*64,(col+1)*96,(row+1)*64)).resize((192,128),Image.Resampling.NEAREST)
  sheet.paste(frame,(348+col*216,416+row*132),frame)
sheet.save(evidence/'workshop-asset-contact-sheet.png')
frames=[]
for tick in range(8):
 im=canvas()
 for row in range(5):
  for col in range(4):
   f=(tick+col)%4
   frame=work.crop((f*96,row*64,(f+1)*96,(row+1)*64)).resize((192,128),Image.Resampling.NEAREST)
   im.paste(frame,(348+col*216,416+row*132),frame)
 frames.append(im.resize((768,678),Image.Resampling.NEAREST))
frames[0].save(evidence/'workshop-asset-actions.gif',save_all=True,append_images=frames[1:],duration=350,loop=0,disposal=2)
check=Image.open(evidence/'workshop-asset-actions.gif');assert check.n_frames>=4
print({'contact':str(evidence/'workshop-asset-contact-sheet.png'),'moving_asset_preview':str(evidence/'workshop-asset-actions.gif'),'frames':check.n_frames,'scope':'actual asset animations; not live game capture'})
