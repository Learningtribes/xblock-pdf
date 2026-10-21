# -*- coding: utf-8 -*-
"""
Minimal CMS routes so PdfBlock.studio_view can reverse uploads and assets.

Patterns match platform/cms/urls.py (COURSE_KEY_PATTERN and ASSET_KEY_PATTERN).
"""

from django.conf.urls import url


def _unused(request, **kwargs):
    return None


_COURSE_KEY = r'(?P<course_key_string>[^/+]+(/|\+)[^/+]+(/|\+)[^/?]+)'
_ASSET_KEY = (
    r'(?P<asset_key_string>(?:/?c4x(:/)?/[^/]+/[^/]+/[^/]+/[^@]+(?:@[^/]+)?)|(?:[^/]+))'
)

urlpatterns = [
    url(r'^uploads/{}$'.format(_COURSE_KEY), _unused, name='uploads_handler'),
    url(r'^assets/{}/{}?$'.format(_COURSE_KEY, _ASSET_KEY), _unused, name='assets_handler'),
]
