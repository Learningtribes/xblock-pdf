"""Setup for pdf XBlock."""

import os
from setuptools import setup


def package_data(pkg, root_list):
    """Generic function to find package_data for `pkg` under `root`."""
    data = []
    for root in root_list:
        for dirname, _, files in os.walk(os.path.join(pkg, root)):
            for fname in files:
                data.append(os.path.relpath(os.path.join(dirname, fname), pkg))

    return {pkg: data}


setup(
    name='xblock-pdf',
    version='1.0.2.post0',
    description='Course component (Open edX XBlock) that provides an easy way to embed a PDF',
    packages=[
        'pdf',
    ],
    python_requires='>=3.10',
    install_requires=[
        'Django>=5.2,<6',
        'XBlock>=6.1,<7',
        'Mako>=1.2,<2',
    ],
    entry_points={
        'xblock.v1': [
            'pdf = pdf.pdf:PdfBlock',
        ]
    },
    package_data=package_data('pdf', ['public', 'static', 'templates', 'translations']),
)
