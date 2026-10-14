"""Run with Python 3.9+ (3.11+ recommended). No install step required."""
import argparse
import atexit
import json
from pathlib import Path
import threading
import webbrowser

from cos.server import LocalServer
from cos.service import Service
from cos.desktop import publish_launch, remove_launch


def main():
    parser = argparse.ArgumentParser(description="Local Chief of Staff — loopback only")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data-dir", default=str(Path(__file__).resolve().parent / "runtime"))
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--preflight", action="store_true", help="Only check configured CLI version/help; never run a model")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("Invalid port")
    service = Service(args.data_dir, start=False)
    if args.preflight:
        try:
            print(json.dumps(service.preflight(), indent=2))
        finally:
            service.close()
        return
    try:
        server = LocalServer(args.port, service)
    except OSError:
        service.close()
        raise
    url = server.origin + "/?token=" + server.token
    manifest = publish_launch(server)
    service.scheduler = threading.Thread(target=service._loop, daemon=True)
    service.scheduler.start()
    print("Chief of Staff is running on this computer only.", flush=True)
    print("Private launch URL (keep local): " + url, flush=True)
    print("Ctrl+C stops the service and its workers. Scheduled briefings run only while it is running.", flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt:
        print("Stopping workers…", flush=True)
    finally:
        server.server_close()
        remove_launch(manifest, server.instance_id)
        service.close()


if __name__ == "__main__":
    main()
