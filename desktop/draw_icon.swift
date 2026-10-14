// Editable vector artwork for the Mac app icon. Build PNG with swift, then iconutil.
import AppKit
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()
func colour(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> NSColor {
    return NSColor(calibratedRed:r, green:g, blue:b, alpha:1)
}
let navy = colour(0.035,0.070,0.12), teal = colour(0.32,0.82,0.86), cream = colour(0.96,0.94,0.85)
navy.setFill()
NSBezierPath(roundedRect:NSRect(x:64,y:64,width:896,height:896),xRadius:200,yRadius:200).fill()
colour(0.08,0.16,0.22).setFill()
NSBezierPath(roundedRect:NSRect(x:94,y:94,width:836,height:836),xRadius:172,yRadius:172).fill()
cream.setFill()
NSBezierPath(ovalIn:NSRect(x:590,y:626,width:228,height:228)).fill()
colour(0.08,0.16,0.22).setFill()
NSBezierPath(ovalIn:NSRect(x:664,y:672,width:192,height:192)).fill()
for (x,y,r) in [(294.0,765.0,10.0),(439,840,7),(861,552,9),(161,622,7),(870,805,5)] {
    teal.setFill();NSBezierPath(ovalIn:NSRect(x:x-r,y:y-r,width:2*r,height:2*r)).fill()
}
let panel=NSBezierPath(roundedRect:NSRect(x:195,y:271,width:634,height:380),xRadius:65,yRadius:65)
navy.setFill();panel.fill();teal.setStroke();panel.lineWidth=18;panel.stroke()
for x in [253.0,306,359] {teal.setFill();NSBezierPath(ovalIn:NSRect(x:x,y:578,width:19,height:19)).fill()}
let heading:[NSAttributedString.Key:Any]=[.font:NSFont.monospacedSystemFont(ofSize:165,weight:.bold),.foregroundColor:cream]
(">_" as NSString).draw(at:NSPoint(x:264,y:325),withAttributes:heading)
let label:[NSAttributedString.Key:Any]=[.font:NSFont.systemFont(ofSize:108,weight:.semibold),.foregroundColor:cream]
let text="CoS" as NSString
let width=text.size(withAttributes:label).width
text.draw(at:NSPoint(x:(1024-width)/2,y:127),withAttributes:label)
image.unlockFocus()
let bitmap = NSBitmapImageRep(data:image.tiffRepresentation!)!
try bitmap.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
