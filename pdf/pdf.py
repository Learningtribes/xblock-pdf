# -*- coding: utf-8 -*-
""" pdfXBlock main Python class"""
from __future__ import unicode_literals

import pkg_resources
from django.conf import settings
from django.template import Context, Template as DjangoTemplate
from mako.template import Template
from six import string_types, text_type
try:
    from urllib.parse import urlparse
except ImportError:
    from urlparse import urlparse
from xblock.core import XBlock
from xblock.fields import Scope, String, Boolean
from xblock.fragment import Fragment
from xblockutils.resources import ResourceLoader
from xblockutils.settings import XBlockWithSettingsMixin, ThemableXBlockMixin

from .utils import _, DummyTranslationService

loader = ResourceLoader(__name__)


def get_html(path, data):
    tplt = Template(pkg_resources.resource_string(__name__, path))
    return tplt.render_unicode(**data)


def _safe_pdf_url(value):
    """
    Accept only http(s) URLs and site-relative paths (a single leading slash).

    HTML escaping does not stop a javascript: or data: URL once it is written
    into href or data-src. Numbers and other non-text values are rejected.
    """
    if not isinstance(value, string_types):
        return None
    url = value.strip()
    if not url or '\\' in url:
        return None
    for char in url:
        code = ord(char)
        if code < 33 or code == 127:
            return None
    # Protocol-relative ("//host") and backslash-normalized paths are not on-site.
    if url.startswith('/') and not url.startswith('//'):
        return url
    parsed = urlparse(url)
    scheme = (parsed.scheme or '').lower()
    if scheme in ('http', 'https') and parsed.netloc:
        return url
    return None


@XBlock.wants('settings')
@XBlock.needs('i18n')
class PdfBlock(
    XBlock,
    XBlockWithSettingsMixin,
    ThemableXBlockMixin
):

    '''
    Icon of the XBlock. Values : [other (default), video, problem]
    '''
    icon_class = "other"

    '''
    Fields
    '''
    display_name = String(
        display_name=_("Display Name"),
        default=_("PDF"),
        scope=Scope.settings,
        help=_("This name appears in the horizontal navigation at the top of the page.")
    )

    url = String(
        display_name=_("PDF URL"),
        default=_(""),
        scope=Scope.content,
        help=_("The URL for your PDF.")
    )

    allow_download = Boolean(
        display_name=_("PDF Download Allowed"),
        default=True,
        scope=Scope.content,
        help=_("Display a download button for this PDF.")
    )

    source_text = String(
        display_name=_("Source document button text"),
        default="",
        scope=Scope.content,
        help=_(
            "Add a download link for the source file of your PDF. "
             "Use it for example to provide the PowerPoint file used to create this PDF."
        )
    )

    source_url = String(
        display_name=_("Source document URL"),
        default="",
        scope=Scope.content,
        help=_(
            "Add a download link for the source file of your PDF. "
             "Use it for example to provide the PowerPoint file used to create this PDF."
        )
    )

    '''
    Util functions
    '''
    def load_resource(self, resource_path):
        """
        Gets the content of a resource
        """
        resource_content = pkg_resources.resource_string(__name__, resource_path)
        return resource_content.decode("utf8")

    def render_template(self, template_path, context=None):
        """
        Evaluate a template by resource path, applying the provided context
        """
        if context is None:
            context = {}
        template_str = self.load_resource(template_path)
        return DjangoTemplate(template_str).render(Context(context))

    '''
    Main functions
    '''
    def student_view(self, context=None):
        """
        The primary view of the XBlock, shown to students
        when viewing courses.
        """
        context = {
            'display_name': self.display_name,
            'url': self.url,
            'allow_download': self.allow_download,
            'source_text': self.source_text,
            'source_url': self.source_url,
            '_i18n_service': self.i18n_service
        }

        html = get_html('templates/html/pdf_view.html', context)

        event_type = 'edx.pdf.loaded'
        event_data = {
            'url': self.url,
            'source_url': self.source_url,
        }
        self.runtime.publish(self, event_type, event_data)

        frag = Fragment(html)
        frag.add_javascript(self.load_resource("static/js/pdf_view.js"))
        frag.initialize_js('pdfXBlockInitView', {
            'display_name': self.display_name,
            'url': self.url,
            'allow_download': self.allow_download,
            'source_text': self.source_text,
            'source_url': self.source_url,
            'iframe_url': '/static/pdf/web/viewer.html?file=' + self.url
        })
        return frag

    def studio_view(self, context=None):
        """
        The secondary view of the XBlock, shown to teachers
        when editing the XBlock.
        """
        max_file_size = getattr(settings, 'MAX_ASSET_UPLOAD_FILE_SIZE_IN_MB', 10)

        context = {
            'display_name': self.display_name,
            'name_help': _("This name appears in the horizontal navigation at the top of the page."),
            'url': self.url,
            'allow_download': self.allow_download,
            'source_text': self.source_text,
            'course_id': self.course_id,
            'source_url': self.source_url,
            'max_file_size_in_mbs': max_file_size,
        }
        html = get_html('templates/html/pdf_edit.html', context)
        frag = Fragment(html)
        frag.add_javascript(self.load_resource("static/js/pdf_edit.js"))
        frag.initialize_js('pdfXBlockInitEdit', {
            'course_id': text_type(self.course_id),
            'current_url': self.url,
            'max_file_size_in_mbs': max_file_size,
        })
        return frag

    @XBlock.json_handler
    def on_download(self, data, suffix=''):
        """
        The download file event handler
        """
        event_type = 'edx.pdf.downloaded'
        event_data = {
            'url': self.url,
            'source_url': self.source_url,
        }
        self.runtime.publish(self, event_type, event_data)

    @XBlock.json_handler
    def save_pdf(self, data, suffix=''):
        """
        The saving handler.

        Validate every field before writing. A missing name or URL, a non-text
        value, or a URL whose scheme is not http, https, or a site-relative
        path is rejected and the stored values are left unchanged.
        """
        if not isinstance(data, dict) or 'display_name' not in data or 'url' not in data:
            return {
                'result': 'error',
                'message': _("Name and PDF URL are required."),
            }

        display_name = data.get('display_name')
        url = _safe_pdf_url(data.get('url'))
        if not isinstance(display_name, string_types) or not display_name.strip():
            return {
                'result': 'error',
                'message': _("Enter a name."),
            }
        if url is None:
            return {
                'result': 'error',
                'message': _("The PDF URL must be an http, https, or site-relative path."),
            }

        source_text = None
        if 'source_text' in data:
            source_text = data.get('source_text')
            if not isinstance(source_text, string_types):
                return {
                    'result': 'error',
                    'message': _("Source document text must be text."),
                }

        # Same scheme rules as the PDF URL: this value is written to a download href.
        source_url = None
        if 'source_url' in data:
            raw_source_url = data.get('source_url')
            if raw_source_url in (None, ''):
                source_url = ''
            else:
                source_url = _safe_pdf_url(raw_source_url)
                if source_url is None:
                    return {
                        'result': 'error',
                        'message': _("The source URL must be an http, https, or site-relative path."),
                    }

        self.display_name = display_name.strip()
        self.url = url
        # Handle both string and boolean values for allow_download
        allow_download = data.get('allow_download', True)
        if isinstance(allow_download, bool):
            self.allow_download = allow_download
        else:
            self.allow_download = (
                allow_download == "True" or allow_download == "true" or allow_download is True
            )
        if source_text is not None:
            self.source_text = source_text
        if source_url is not None:
            self.source_url = source_url

        return {
            'result': 'success',
        }

    @property
    def i18n_service(self):
        """ Obtains translation service """
        i18n_service = self.runtime.service(self, "i18n")
        if i18n_service:
            return i18n_service
        else:
            return DummyTranslationService()
