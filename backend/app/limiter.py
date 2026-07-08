"""Shared slowapi Limiter instance.

Kept in its own module so that route files (forecast.py, products.py) can
import it without causing a circular dependency through main.py.

IP detection behind Railway's proxy
------------------------------------
Railway terminates TLS and forwards the real client IP in X-Forwarded-For.
Two key_func options are available:

  get_remote_address  (slowapi built-in)
    Uses request.client.host — the TCP peer address.
    Correct when Railway passes the real IP directly as the peer.

  get_forwarded_address  (defined below)
    Reads the leftmost value from X-Forwarded-For.
    Correct when Railway's load-balancer is the TCP peer and the real client
    IP only appears in the header.

How to tell which you need:
  1. Deploy with the current config (get_remote_address).
  2. Hit GET /api/debug/ip from two different networks.
  3. If client_host differs per network  -> get_remote_address is fine, done.
     If client_host is the same for both -> switch to get_forwarded_address.
"""
from __future__ import annotations

from starlette.requests import Request

from slowapi import Limiter
from slowapi.util import get_remote_address


def get_forwarded_address(request: Request) -> str:
    """Return the real client IP from X-Forwarded-For (leftmost = originating client).

    Falls back to request.client.host when the header is absent so local dev
    still works without any proxy in the chain.
    """
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # "client, proxy1, proxy2" — leftmost entry is the original caller
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Active limiter — switch key_func to get_forwarded_address if /api/debug/ip
# shows that client_host is a Railway-internal IP shared across all users.
limiter = Limiter(key_func=get_remote_address, default_limits=[])
