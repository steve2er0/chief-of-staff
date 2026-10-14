// Native Finder entry point. The service and CLI keep using the checkout's Python code.
import AppKit
import Foundation
let logs = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Chief of Staff")
try? FileManager.default.createDirectory(at:logs,withIntermediateDirectories:true)
let log = logs.appendingPathComponent("launcher.log")
if !FileManager.default.fileExists(atPath:log.path) {
    FileManager.default.createFile(atPath:log.path,contents:nil,attributes:[.posixPermissions:0o600])
}
let output = try? FileHandle(forWritingTo:log)
output?.seekToEndOfFile()
do {
    guard let resources = Bundle.main.resourceURL else { throw NSError(domain:"Launcher resources are missing",code:1) }
    let data = try Data(contentsOf:resources.appendingPathComponent("launcher.json"))
    let config = try JSONSerialization.jsonObject(with:data) as! [String:Any]
    let child = Process()
    child.executableURL = URL(fileURLWithPath:config["python"] as! String)
    child.arguments = ["-B",resources.appendingPathComponent("bootstrap.py").path]
    child.standardOutput = output
    child.standardError = output
    try child.run()
    child.waitUntilExit()
    if child.terminationStatus != 0 {
        NSWorkspace.shared.open(log)
    }
} catch {
    let alert = NSAlert()
    alert.messageText = "Chief of Staff could not open"
    alert.informativeText = error.localizedDescription
    alert.addButton(withTitle:"OK")
    alert.runModal()
}
try? output?.close()
