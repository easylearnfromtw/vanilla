import pytest
from fastapi import HTTPException
import ceres_api_access as api


def test_public_application_is_disabled():
    with pytest.raises(HTTPException) as exc:
        api.request_access(api.UserRequest(user_id=123))
    assert exc.value.status_code == 503


def test_inference_not_exposed():
    assert api.status()['inference'] == 'disabled'
