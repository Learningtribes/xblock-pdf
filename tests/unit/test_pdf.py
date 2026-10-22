# -*- coding: utf-8 -*-
"""Unit tests for PdfBlock.save_pdf and PdfBlock.studio_view."""
from __future__ import unicode_literals

import json
import unittest

import django
from django.conf import settings
from six import text_type
from webob import Request
from xblock.field_data import DictFieldData
from xblock.runtime import DictKeyValueStore, KvsFieldData
from xblock.test.tools import TestRuntime


class MockRuntime(TestRuntime):
    """Runtime stub used by the other XBlock packages in this repo."""

    def __init__(self, **kwargs):
        field_data = kwargs.get('field_data', KvsFieldData(DictKeyValueStore()))
        super(MockRuntime, self).__init__(field_data=field_data)

if not settings.configured:
    settings.configure(
        SECRET_KEY='pdf-xblock-test',
        USE_I18N=True,
        USE_L10N=False,
        LANGUAGE_CODE='en',
        MAX_ASSET_UPLOAD_FILE_SIZE_IN_MB=10,
        ROOT_URLCONF='tests.unit.studio_urls',
    )
try:
    django.setup()
except RuntimeError:
    # The host project (or another test module) already initialized Django.
    pass

from pdf.pdf import PdfBlock  # noqa: E402


COURSE_ID = 'course-v1:org+course+run'
RELATIVE_URL = '/asset-v1:org+course+run+type@asset+block@notes.pdf'
HTTPS_URL = 'https://cdn.example.com/files/notes.pdf'


def make_request(payload):
    """Build a JSON POST the XBlock handler runtime accepts."""
    request = Request.blank('/')
    request.method = 'POST'
    request.content_type = 'application/json'
    request.body = json.dumps(payload).encode('utf-8')
    return request


def response_json(response):
    """Decode a handler return value, whether it is a dict or a webob response."""
    if isinstance(response, dict):
        return response
    body = response.body
    if not isinstance(body, text_type):
        body = body.decode('utf-8')
    return json.loads(body)


def fragment_html(fragment):
    content = getattr(fragment, 'content', None)
    if content:
        return content
    return fragment.body_html()


def fragment_javascript(fragment):
    chunks = []
    for resource in getattr(fragment, 'resources', ()):
        data = getattr(resource, 'data', None)
        if data is None and isinstance(resource, (list, tuple)) and len(resource) > 1:
            data = resource[1]
        if isinstance(data, text_type):
            chunks.append(data)
        elif data is not None:
            chunks.append(text_type(data))
    return u'\n'.join(chunks)


def fragment_init_args(fragment):
    raw_args = getattr(fragment, 'json_init_args', None)
    if raw_args is None:
        raw_args = getattr(fragment, '_json_init_args', None)
    if isinstance(raw_args, text_type):
        return json.loads(raw_args)
    if raw_args is None:
        return {}
    return raw_args


class PdfBlockTestCase(unittest.TestCase):
    """Shared block with a source document already stored."""

    def setUp(self):
        super(PdfBlockTestCase, self).setUp()
        self.runtime = MockRuntime()
        self.block = PdfBlock(
            self.runtime,
            DictFieldData({
                'display_name': 'Lecture notes',
                'url': RELATIVE_URL,
                'allow_download': True,
                'source_text': 'Slides',
                'source_url': 'https://cdn.example.com/slides.pptx',
            }),
            None,
        )
        self.block.course_id = COURSE_ID

    def save(self, payload):
        return response_json(self.block.handle('save_pdf', make_request(payload)))


class SavePdfTests(PdfBlockTestCase):
    """save_pdf validates input before it writes field values."""

    def test_saves_relative_url_and_strips_name(self):
        result = self.save({
            'display_name': '  Week 1  ',
            'url': '  ' + RELATIVE_URL + '  ',
            'allow_download': False,
        })

        self.assertEqual(result['result'], 'success')
        self.assertEqual(self.block.display_name, 'Week 1')
        self.assertEqual(self.block.url, RELATIVE_URL)
        self.assertFalse(self.block.allow_download)
        # Omitted source fields stay as they were.
        self.assertEqual(self.block.source_text, 'Slides')
        self.assertEqual(self.block.source_url, 'https://cdn.example.com/slides.pptx')

    def test_saves_https_url_and_boolean_download_flag(self):
        result = self.save({
            'display_name': 'External PDF',
            'url': HTTPS_URL,
            'allow_download': True,
        })

        self.assertEqual(result['result'], 'success')
        self.assertEqual(self.block.url, HTTPS_URL)
        self.assertTrue(self.block.allow_download)

    def test_rejects_string_allow_download(self):
        result = self.save({
            'display_name': 'Lecture notes',
            'url': RELATIVE_URL,
            'allow_download': 'true',
        })

        self.assertEqual(result['result'], 'error')
        self.assertTrue(self.block.allow_download)

    def test_missing_fields_do_not_raise_and_keep_stored_values(self):
        result = self.save({})

        self.assertEqual(result['result'], 'error')
        self.assertEqual(self.block.display_name, 'Lecture notes')
        self.assertEqual(self.block.url, RELATIVE_URL)

    def test_rejects_non_text_url(self):
        result = self.save({
            'display_name': 'Lecture notes',
            'url': 123,
        })

        self.assertEqual(result['result'], 'error')
        self.assertEqual(self.block.url, RELATIVE_URL)

    def test_rejects_javascript_url(self):
        result = self.save({
            'display_name': 'Lecture notes',
            'url': 'javascript:alert(1)',
        })

        self.assertEqual(result['result'], 'error')
        self.assertEqual(self.block.display_name, 'Lecture notes')
        self.assertEqual(self.block.url, RELATIVE_URL)

    def test_keeps_legacy_url_when_unchanged(self):
        for legacy in ('files/notes.pdf', 'files/my notes.pdf'):
            self.block.url = legacy
            self.block.display_name = 'Lecture notes'

            result = self.save({
                'display_name': 'Renamed notes',
                'url': legacy,
            })

            self.assertEqual(result['result'], 'success')
            self.assertEqual(self.block.display_name, 'Renamed notes')
            self.assertEqual(self.block.url, legacy)

    def test_rejects_replacing_legacy_url_with_unsafe_url(self):
        self.block.url = 'files/notes.pdf'

        result = self.save({
            'display_name': 'Renamed notes',
            'url': 'javascript:alert(1)',
        })

        self.assertEqual(result['result'], 'error')
        self.assertEqual(self.block.display_name, 'Lecture notes')
        self.assertEqual(self.block.url, 'files/notes.pdf')

    def test_replaces_legacy_url_with_safe_url(self):
        self.block.url = 'files/notes.pdf'

        result = self.save({
            'display_name': 'Lecture notes',
            'url': RELATIVE_URL,
        })

        self.assertEqual(result['result'], 'success')
        self.assertEqual(self.block.url, RELATIVE_URL)

    def test_rejects_protocol_relative_url(self):
        result = self.save({
            'display_name': 'Lecture notes',
            'url': '//evil.example/a.pdf',
        })

        self.assertEqual(result['result'], 'error')
        self.assertEqual(self.block.url, RELATIVE_URL)

    def test_rejects_unsafe_source_url_without_changing_fields(self):
        result = self.save({
            'display_name': 'Renamed',
            'url': HTTPS_URL,
            'source_url': 'javascript:alert(1)',
        })

        self.assertEqual(result['result'], 'error')
        self.assertEqual(self.block.display_name, 'Lecture notes')
        self.assertEqual(self.block.url, RELATIVE_URL)
        self.assertEqual(self.block.source_url, 'https://cdn.example.com/slides.pptx')

    def test_clears_source_url_when_blank(self):
        result = self.save({
            'display_name': 'Lecture notes',
            'url': RELATIVE_URL,
            'source_text': 'Handout',
            'source_url': '',
        })

        self.assertEqual(result['result'], 'success')
        self.assertEqual(self.block.source_text, 'Handout')
        self.assertEqual(self.block.source_url, '')


class StudioViewTests(PdfBlockTestCase):
    """studio_view renders the editor and passes Studio asset URLs to its JavaScript."""

    def test_renders_editor_with_hidden_url_and_escaped_name(self):
        self.block.display_name = 'Notes <script>'
        self.block.url = 'https://cdn.example.com/a.pdf?x=1&y=2'
        self.block.allow_download = False

        fragment = self.block.studio_view()
        html = fragment_html(fragment)

        self.assertIn('pdf-editor-modal', html)
        self.assertIn('id="pdf-upload-zone"', html)
        self.assertIn('type="hidden" id="pdf_edit_url"', html)
        self.assertIn('value="https://cdn.example.com/a.pdf?x=1&amp;y=2"', html)
        self.assertIn('value="Notes &lt;script&gt;"', html)
        self.assertNotIn('>PDF URL<', html)
        self.assertNotIn('checked', html)
        self.assertIn('less than {0} MB'.format(settings.MAX_ASSET_UPLOAD_FILE_SIZE_IN_MB), html)

        self.assertEqual(fragment.js_init_fn, 'pdfXBlockInitEdit')
        init_args = fragment_init_args(fragment)
        self.assertEqual(init_args['uploads_url'], '/uploads/{0}'.format(COURSE_ID))
        self.assertEqual(init_args['assets_url'], '/assets/{0}/'.format(COURSE_ID))
        self.assertEqual(init_args['current_url'], self.block.url)
        self.assertEqual(init_args['max_file_size_in_mbs'], settings.MAX_ASSET_UPLOAD_FILE_SIZE_IN_MB)
        script = fragment_javascript(fragment)
        self.assertIn('function pdfXBlockInitEdit', script)
        self.assertNotIn("'/uploads/'", script)
        self.assertNotIn("'/assets/'", script)


if __name__ == '__main__':
    unittest.main()
