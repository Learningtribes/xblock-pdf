/* Javascript for pdfXBlock. */
function pdfXBlockInitEdit(runtime, element, options) {
    var courseId = options.course_id;
    var currentUrl = options.current_url;
    var maxFileSizeInMbs = options.max_file_size_in_mbs || 10;
    // Match Studio server limit (assets.py uses MB * 1000 ** 2), not binary MiB.
    var maxFileSizeBytes = maxFileSizeInMbs * 1000 * 1000;

    var selectedPdfUrl = currentUrl;
    var pdfAssets = [];
    var uploadingFiles = [];
    var nameManuallyEdited = false;

    var $element = $(element);
    var $uploadZone = $element.find('#pdf-upload-zone');
    var $fileInput = $element.find('#pdf-file-input');
    var $filesSection = $element.find('#pdf-files-section');
    var $filesGrid = $element.find('#pdf-files-grid');
    var $urlInput = $element.find('#pdf_edit_url');
    var $nameInput = $element.find('#pdf_edit_display_name');

    init();

    function init() {
        bindEvents();
        fetchPdfAssets();
    }

    function bindEvents() {
        var fileInputEl = $fileInput[0];

        // The file input lives inside the zone. A click handler that calls
        // preventDefault cancels the dialog when the input's own click bubbles.
        $fileInput.on('click', function(e) {
            e.stopPropagation();
        });

        $uploadZone.on('click', function(e) {
            if (e.target !== fileInputEl) {
                fileInputEl.click();
            }
        });
        $uploadZone.on('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
                e.preventDefault();
                fileInputEl.click();
            }
        });

        $fileInput.on('change', function(e) {
            handleFileSelect(e.target.files);
            // Reset input so same file can be selected again
            this.value = '';
        });

        $uploadZone.on('dragenter dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $uploadZone.addClass('drag-over');
        });

        $uploadZone.on('dragleave', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $uploadZone.removeClass('drag-over');
        });

        $uploadZone.on('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $uploadZone.removeClass('drag-over');
            var files = e.originalEvent.dataTransfer.files;
            handleFileSelect(files);
        });

        $nameInput.on('input', function() {
            nameManuallyEdited = true;
        });

        $element.find('.action-cancel').on('click', function(e) {
            e.preventDefault();
            runtime.notify('cancel', {});
        });

        $element.find('.action-save').on('click', function(e) {
            e.preventDefault();
            savePdf();
        });
    }

    function isPdfAsset(asset) {
        var contentType = (asset.content_type || '').toLowerCase();
        var name = (asset.display_name || '').toLowerCase();
        return contentType.indexOf('pdf') !== -1 || /\.pdf$/.test(name);
    }

    function fetchPdfAssets() {
        // Use Studio's author-only uploads listing (has_course_author_access).
        // Do not use an XBlock handler — those are reachable from the LMS.
        var listUrl = '/uploads/' + courseId +
            '?format=json&file_type=Document&page_size=0';

        $.ajax({
            url: listUrl,
            type: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            success: function(response) {
                if (response && response.error) {
                    showNotification('error', response.error);
                    return;
                }
                var assets = response.assets || [];
                pdfAssets = assets.filter(isPdfAsset);
                renderPdfGrid();
            },
            error: function() {
                showNotification('error', gettext('Failed to load PDF files.'));
            }
        });
    }

    function renderPdfGrid() {
        $filesGrid.empty();

        if (pdfAssets.length === 0 && uploadingFiles.length === 0) {
            $filesSection.hide();
            return;
        }

        $filesSection.show();

        uploadingFiles.forEach(function(file) {
            var $item = createUploadingPdfItem(file);
            file.$item = $item;
            $filesGrid.append($item);
        });

        pdfAssets.forEach(function(asset) {
            var $item = createPdfItem(asset);
            $filesGrid.append($item);
        });

        updateSelection();
    }

    function createPdfItem(asset) {
        var assetUrl = asset.url;
        var isSelected = selectedPdfUrl && (
            selectedPdfUrl === assetUrl ||
            selectedPdfUrl === asset.external_url ||
            selectedPdfUrl.indexOf(assetUrl) !== -1
        );

        var $item = $('<div class="pdf-file-item" role="option" tabindex="0"></div>');
        if (isSelected) {
            $item.addClass('selected');
            $item.attr('aria-selected', 'true');
        } else {
            $item.attr('aria-selected', 'false');
        }
        $item.attr('data-url', assetUrl);
        $item.attr('aria-label', asset.display_name);

        var $preview = $('<div class="pdf-file-preview" aria-hidden="true"></div>');
        $preview.append('<span class="pdf-badge">pdf</span>');
        $preview.append('<div class="pdf-icon"><i class="far fa-file-pdf"></i></div>');
        $item.append($preview);

        var $info = $('<div class="pdf-file-info"></div>');
        var $name = $('<div class="pdf-file-name"></div>');
        $name.attr('title', asset.display_name);
        $name.text(asset.display_name);
        $info.append($name);
        $info.append($('<div class="pdf-file-size"></div>').text(formatFileSize(asset.size)));
        $item.append($info);

        function activate() {
            selectPdf(assetUrl, asset.display_name);
        }

        $item.on('click', activate);
        $item.on('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
                e.preventDefault();
                activate();
            }
        });

        return $item;
    }

    function createUploadingPdfItem(file) {
        var $item = $('<div class="pdf-file-item uploading" role="option" aria-disabled="true"></div>');
        $item.attr('data-filename', file.name);
        $item.attr('aria-label', gettext('Uploading {name}').replace('{name}', file.name));

        var $preview = $('<div class="pdf-file-preview" aria-hidden="true"></div>');
        $preview.append('<span class="pdf-badge">pdf</span>');
        $preview.append('<div class="pdf-icon"><i class="far fa-file-pdf"></i></div>');

        var $progress = $('<div class="pdf-upload-overlay"></div>');
        var $progressBar = $('<progress class="pdf-item-progress" max="100"></progress>').val(file.progress || 0);
        $progress.append($progressBar);
        $preview.append($progress);
        file.$progressBar = $progressBar;

        $item.append($preview);

        var $info = $('<div class="pdf-file-info"></div>');
        var $name = $('<div class="pdf-file-name"></div>');
        $name.attr('title', file.name);
        $name.text(file.name);
        $info.append($name);
        $info.append($('<div class="pdf-file-size"></div>').text(formatFileSize(file.size)));
        $item.append($info);

        return $item;
    }

    function maybeSetDisplayName(displayName) {
        if (nameManuallyEdited) {
            return;
        }
        var nameWithoutExt = (displayName || '').replace(/\.pdf$/i, '');
        $nameInput.val(nameWithoutExt);
    }

    function selectPdf(url, displayName) {
        selectedPdfUrl = url;
        $urlInput.val(url);

        $filesGrid.find('.pdf-file-item').removeClass('selected').attr('aria-selected', 'false');
        $filesGrid.find('.pdf-file-item').filter(function() {
            return $(this).attr('data-url') === url;
        }).addClass('selected').attr('aria-selected', 'true');

        maybeSetDisplayName(displayName);
    }

    function updateSelection() {
        $filesGrid.find('.pdf-file-item').removeClass('selected').attr('aria-selected', 'false');
        if (selectedPdfUrl) {
            $filesGrid.find('.pdf-file-item').each(function() {
                var itemUrl = $(this).attr('data-url');
                if (itemUrl && (
                    selectedPdfUrl === itemUrl ||
                    selectedPdfUrl.indexOf(itemUrl) !== -1 ||
                    itemUrl.indexOf(selectedPdfUrl) !== -1
                )) {
                    $(this).addClass('selected').attr('aria-selected', 'true');
                }
            });
        }
    }

    function handleFileSelect(files) {
        if (!files || files.length === 0) {
            return;
        }

        var validFiles = [];

        for (var i = 0; i < files.length; i++) {
            var file = files[i];

            if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                showNotification('error', gettext('Only PDF files are allowed.'));
                continue;
            }

            if (file.size > maxFileSizeBytes) {
                showNotification(
                    'error',
                    gettext('File size exceeds the maximum limit of {size}MB.').replace('{size}', maxFileSizeInMbs)
                );
                continue;
            }

            validFiles.push(file);
        }

        validFiles.forEach(function(file) {
            uploadFile(file);
        });
    }

    function parseUploadError(xhr) {
        try {
            var response = JSON.parse(xhr.responseText);
            if (response && response.error) {
                return response.error;
            }
        } catch (e) {
            // fall through
        }
        return gettext('Upload failed');
    }

    function uploadFile(file) {
        var uploadingFile = {
            name: file.name,
            size: file.size,
            progress: 0,
            $item: null,
            $progressBar: null
        };

        uploadingFiles.push(uploadingFile);
        renderPdfGrid();

        var formData = new FormData();
        formData.append('file', file);

        var uploadUrl = '/assets/' + courseId + '/';
        var csrftoken = $.cookie('csrftoken');
        var xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', function(e) {
            if (e.lengthComputable) {
                var progress = Math.round((e.loaded / e.total) * 100);
                uploadingFile.progress = progress;
                if (uploadingFile.$progressBar) {
                    uploadingFile.$progressBar.val(progress);
                }
            }
        });

        xhr.addEventListener('load', function() {
            var index = uploadingFiles.indexOf(uploadingFile);
            if (index > -1) {
                uploadingFiles.splice(index, 1);
            }

            if (xhr.status === 200) {
                try {
                    var response = JSON.parse(xhr.responseText);
                    if (response.asset) {
                        var newAsset = {
                            id: response.asset.id,
                            display_name: response.asset.display_name || file.name,
                            content_type: 'application/pdf',
                            url: response.asset.url,
                            external_url: response.asset.external_url,
                            size: file.size
                        };

                        pdfAssets.unshift(newAsset);

                        // Prefer relative course asset URL (portable across re-runs / domains).
                        selectedPdfUrl = response.asset.url;
                        $urlInput.val(selectedPdfUrl);
                        maybeSetDisplayName(file.name);

                        showNotification('success', gettext('Upload completed'));
                    } else if (response.error) {
                        showNotification('error', response.error);
                    } else {
                        showNotification('error', gettext('Upload failed'));
                    }
                } catch (e) {
                    showNotification('error', gettext('Upload failed'));
                }
            } else {
                showNotification('error', parseUploadError(xhr));
            }

            renderPdfGrid();
        });

        xhr.addEventListener('error', function() {
            var index = uploadingFiles.indexOf(uploadingFile);
            if (index > -1) {
                uploadingFiles.splice(index, 1);
            }
            showNotification('error', gettext('Upload failed'));
            renderPdfGrid();
        });

        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('X-CSRFToken', csrftoken);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.send(formData);
    }

    function savePdf() {
        var displayName = $nameInput.val();
        var url = $urlInput.val().trim();
        var allowDownload = $element.find('#pdf_edit_allow_download').is(':checked');

        if (!url) {
            showNotification('error', gettext('Please select or upload a PDF file.'));
            return;
        }

        // Do not send source_text/source_url — omitting them preserves any
        // existing source document link configured outside this editor.
        var data = {
            'display_name': displayName || 'PDF',
            'url': url,
            'allow_download': allowDownload ? 'True' : 'False'
        };

        runtime.notify('save', { state: 'start' });

        var handlerUrl = runtime.handlerUrl(element, 'save_pdf');
        $.post(handlerUrl, JSON.stringify(data)).done(function(response) {
            if (response.result === 'success') {
                runtime.notify('save', { state: 'end' });
            } else {
                runtime.notify('error', { msg: response.message || 'Save failed' });
            }
        }).fail(function() {
            runtime.notify('error', { msg: 'Save failed' });
        });
    }

    function showNotification(type, message) {
        var Notification = window.LearningTribes && window.LearningTribes.Notification;
        if (Notification) {
            if (type === 'error' && Notification.Error) {
                Notification.Error({
                    title: gettext('Error'),
                    message: message
                });
                return;
            }
            if (type === 'success' && Notification.Success) {
                Notification.Success({
                    title: message
                });
                return;
            }
        }
        // Fallback when Studio notification helpers are unavailable
        if (type === 'error') {
            runtime.notify('error', { msg: message });
        } else if (window.console && console.log) {
            console.log('[' + type.toUpperCase() + '] ' + message);
        }
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) {
            return '0 B';
        }

        var units = ['B', 'KB', 'MB', 'GB'];
        var k = 1024;
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        var size = (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1);

        return size + ' ' + units[i];
    }

    if (typeof gettext === 'undefined') {
        window.gettext = function(str) { return str; };
    }
}
