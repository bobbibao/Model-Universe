from __future__ import annotations

import base64
import hashlib
import hmac


class HmacTokenSigner:
    """token = base64url(payload) + "." + hex(hmac_sha256(secret, payload))"""

    def __init__(self, secret: str) -> None:
        if not secret:
            raise ValueError("signing secret must not be empty")
        self._key = secret.encode("utf-8")

    def _mac(self, payload: bytes) -> str:
        return hmac.new(self._key, payload, hashlib.sha256).hexdigest()

    def sign(self, payload: str) -> str:
        raw = payload.encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=") + "." + self._mac(raw)

    def verify(self, token: str) -> str | None:
        try:
            encoded, mac = token.rsplit(".", 1)
            raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        except (ValueError, base64.binascii.Error):
            return None
        return raw.decode("utf-8") if hmac.compare_digest(mac, self._mac(raw)) else None
