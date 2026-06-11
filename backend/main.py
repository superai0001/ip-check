"""Deployment entrypoint: exposes the FastAPI app as `main:app`.

The implementation lives in `app/main.py`; this re-export lets ASGI servers
(and the deploy template's default `uvicorn main:app`) find the app at the
project root.
"""

from app.main import app

__all__ = ["app"]
