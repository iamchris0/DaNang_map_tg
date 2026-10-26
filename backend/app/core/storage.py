import json
import logging
from functools import lru_cache
from typing import TYPE_CHECKING, Protocol

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import get_settings

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

logger = logging.getLogger(__name__)

# Object keys are never reused (they embed the image id), so clients may cache forever.
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"


@lru_cache
def get_s3_client() -> "S3Client":
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id.get_secret_value() or None,
        aws_secret_access_key=settings.s3_secret_access_key.get_secret_value() or None,
        config=Config(
            s3={"addressing_style": "path"},
            connect_timeout=3,
            read_timeout=30,
            retries={"max_attempts": 2},
        ),
    )


def check_bucket() -> None:
    """Raise if the configured bucket is unreachable."""
    get_s3_client().head_bucket(Bucket=get_settings().s3_bucket)


def _public_read_policy(bucket: str) -> str:
    return json.dumps(
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{bucket}/*"],
                }
            ],
        }
    )


def ensure_bucket() -> None:
    """Development convenience: create the bucket and make its objects publicly readable.
    Production buckets are provisioned out-of-band (see README)."""
    client = get_s3_client()
    bucket = get_settings().s3_bucket
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError:
        logger.info("Creating S3 bucket %s", bucket)
        client.create_bucket(Bucket=bucket)
    client.put_bucket_policy(Bucket=bucket, Policy=_public_read_policy(bucket))


class ObjectStorage(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> None: ...

    def delete(self, keys: list[str]) -> None: ...


class S3Storage:
    def __init__(self, client: "S3Client", bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            CacheControl=IMMUTABLE_CACHE,
        )

    def delete(self, keys: list[str]) -> None:
        if keys:
            self._client.delete_objects(
                Bucket=self._bucket,
                Delete={"Objects": [{"Key": key} for key in keys], "Quiet": True},
            )


def get_storage() -> ObjectStorage:
    """FastAPI dependency; tests override it with an in-memory implementation."""
    return S3Storage(get_s3_client(), get_settings().s3_bucket)
