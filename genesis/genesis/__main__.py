"""Command line entry point: ``python3 -m genesis [--host HOST] [--port PORT] [--data-dir DIR]``."""

import argparse
import sys

from .server import serve


def main(argv=None):
    parser = argparse.ArgumentParser(prog="genesis", description="GENESIS business accounting server")
    parser.add_argument("--host", default="127.0.0.1", help="address to listen on (use 0.0.0.0 to expose)")
    parser.add_argument("--port", type=int, default=8000, help="port to listen on")
    parser.add_argument("--data-dir", default=None, help="folder for company databases and backups")
    args = parser.parse_args(argv)
    return serve(data_dir=args.data_dir, host=args.host, port=args.port)


if __name__ == "__main__":
    sys.exit(main())
