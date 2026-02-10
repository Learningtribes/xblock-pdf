/* Javascript for pdfXBlock. */
function pdfXBlockInitEdit(runtime, element, options) {
    var courseId = options.course_id;
    var currentUrl = options.current_url;
    var maxFileSizeInMbs = options.max_file_size_in_mbs || 10;
    var maxFileSizeBytes = maxFileSizeInMbs * 1024 * 1024;
    
    var selectedPdfUrl = currentUrl;
    var pdfAssets = [];
    var uploadingFiles = [];
    
    var $element = $(element);
    var $uploadZone = $element.find('#pdf-upload-zone');
    var $fileInput = $element.find('#pdf-file-input');
    var $browseButton = $element.find('#pdf-browse-button');
    var $filesSection = $element.find('#pdf-files-section');
    var $filesGrid = $element.find('#pdf-files-grid');
    var $urlInput = $element.find('#pdf_edit_url');
    
    init();
    
    function init() {
        bindEvents();
        fetchPdfAssets();
    }
    
    function bindEvents() {
        // Trigger file input
        $uploadZone.on('click', function(e) {
            e.preventDefault();
            $fileInput.trigger('click');
        });
        
        $element.on('click', '#pdf-browse-button', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $fileInput.trigger('click');
        });
        
        // File input change
        $fileInput.on('change', function(e) {
            handleFileSelect(e.target.files);
            // Reset input so same file can be selected again
            this.value = '';
        });
        
        // Drag and drop
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
        
        // Cancel button
        $element.find('.action-cancel').on('click', function(e) {
            e.preventDefault();
            runtime.notify('cancel', {});
        });
        
        // Save button
        $element.find('.action-save').on('click', function(e) {
            e.preventDefault();
            savePdf();
        });
    }
    
    function fetchPdfAssets() {
        var handlerUrl = runtime.handlerUrl(element, 'get_pdf_assets');
        
        $.ajax({
            url: handlerUrl,
            type: 'POST',
            data: JSON.stringify({}),
            contentType: 'application/json',
            success: function(response) {
                if (response.result === 'success') {
                    pdfAssets = response.assets || [];
                    renderPdfGrid();
                }
            },
            error: function() {
                console.error('Failed to fetch PDF assets');
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
        
        // Render uploading files first
        uploadingFiles.forEach(function(file) {
            var $item = createUploadingPdfItem(file);
            $filesGrid.append($item);
        });
        
        // Render existing PDF assets
        pdfAssets.forEach(function(asset) {
            var $item = createPdfItem(asset);
            $filesGrid.append($item);
        });
        
        // Highlight currently selected PDF
        updateSelection();
    }
    
    function createPdfItem(asset) {
        var assetUrl = asset.url;
        var isSelected = selectedPdfUrl && (
            selectedPdfUrl === assetUrl || 
            selectedPdfUrl === asset.external_url ||
            selectedPdfUrl.indexOf(assetUrl) !== -1
        );
        
        var $item = $('<div class="pdf-file-item' + (isSelected ? ' selected' : '') + '" data-url="' + escapeHtml(assetUrl) + '"></div>');
        
        var $preview = $('<div class="pdf-file-preview"></div>');
        $preview.append('<span class="pdf-badge">pdf</span>');
        $preview.append('<div class="pdf-icon"><i class="far fa-file-pdf"></i></div>');
        $item.append($preview);
        
        var $info = $('<div class="pdf-file-info"></div>');
        $info.append('<div class="pdf-file-name" title="' + escapeHtml(asset.display_name) + '">' + escapeHtml(asset.display_name) + '</div>');
        $info.append('<div class="pdf-file-size">' + formatFileSize(asset.size) + '</div>');
        $item.append($info);
        
        // Click to select
        $item.on('click', function() {
            selectPdf(assetUrl, asset.display_name);
        });
        
        return $item;
    }
    
    function createUploadingPdfItem(file) {
        var $item = $('<div class="pdf-file-item uploading" data-filename="' + escapeHtml(file.name) + '"></div>');
        
        var $preview = $('<div class="pdf-file-preview"></div>');
        $preview.append('<span class="pdf-badge">pdf</span>');
        $preview.append('<div class="pdf-icon"><i class="far fa-file-pdf"></i></div>');
        
        // Progress bar
        var $progress = $('<div class="pdf-upload-overlay"></div>');
        $progress.append('<progress class="pdf-item-progress" value="' + (file.progress || 0) + '" max="100"></progress>');
        $preview.append($progress);
        
        $item.append($preview);
        
        var $info = $('<div class="pdf-file-info"></div>');
        $info.append('<div class="pdf-file-name" title="' + escapeHtml(file.name) + '">' + escapeHtml(file.name) + '</div>');
        $info.append('<div class="pdf-file-size">' + formatFileSize(file.size) + '</div>');
        $item.append($info);
        
        return $item;
    }
    
    function selectPdf(url, displayName) {
        selectedPdfUrl = url;
        $urlInput.val(url);
        
        // Update visual selection
        $filesGrid.find('.pdf-file-item').removeClass('selected');
        $filesGrid.find('.pdf-file-item[data-url="' + escapeHtml(url) + '"]').addClass('selected');
        
        // Always update the name field when selecting a different file
        var $nameInput = $element.find('#pdf_edit_display_name');
        // Extract filename without extension for display name
        var nameWithoutExt = displayName.replace(/\.pdf$/i, '');
        $nameInput.val(nameWithoutExt);
    }
    
    function updateSelection() {
        $filesGrid.find('.pdf-file-item').removeClass('selected');
        if (selectedPdfUrl) {
            // Try to find matching item
            $filesGrid.find('.pdf-file-item').each(function() {
                var itemUrl = $(this).data('url');
                if (itemUrl && (
                    selectedPdfUrl === itemUrl ||
                    selectedPdfUrl.indexOf(itemUrl) !== -1 ||
                    itemUrl.indexOf(selectedPdfUrl) !== -1
                )) {
                    $(this).addClass('selected');
                }
            });
        }
    }
    
    function handleFileSelect(files) {
        if (!files || files.length === 0) return;
        
        var validFiles = [];
        
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            
            // Validate file type
            if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                showNotification('error', gettext('Only PDF files are allowed.'));
                continue;
            }
            
            // Validate file size
            if (file.size > maxFileSizeBytes) {
                showNotification('error', gettext('File size exceeds the maximum limit of {size}MB.').replace('{size}', maxFileSizeInMbs));
                continue;
            }
            
            validFiles.push(file);
        }
        
        // Upload valid files
        validFiles.forEach(function(file) {
            uploadFile(file);
        });
    }
    
    function uploadFile(file) {
        var uploadingFile = {
            name: file.name,
            size: file.size,
            progress: 0
        };
        
        uploadingFiles.push(uploadingFile);
        renderPdfGrid();
        
        var formData = new FormData();
        formData.append('file', file);
        
        var courseKey = courseId;
        var uploadUrl = '/assets/' + courseKey + '/';
        var csrftoken = $.cookie('csrftoken');
        
        var xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', function(e) {
            if (e.lengthComputable) {
                var progress = Math.round((e.loaded / e.total) * 100);
                uploadingFile.progress = progress;
                updateUploadProgress(file.name, progress);
            }
        });
        
        xhr.addEventListener('load', function() {
            // Remove from uploading list
            var index = uploadingFiles.indexOf(uploadingFile);
            if (index > -1) {
                uploadingFiles.splice(index, 1);
            }
            
            if (xhr.status === 200) {
                try {
                    var response = JSON.parse(xhr.responseText);
                    if (response.asset) {
                        // Add to assets list
                        var newAsset = {
                            id: response.asset.id,
                            display_name: response.asset.display_name || file.name,
                            content_type: 'application/pdf',
                            url: response.asset.url,
                            external_url: response.asset.external_url,
                            size: file.size
                        };
                        
                        // Add to beginning of list
                        pdfAssets.unshift(newAsset);
                        
                        // Auto-select the newly uploaded file
                        selectedPdfUrl = response.asset.url;
                        $urlInput.val(selectedPdfUrl);
                        
                        // Update name for newly uploaded file
                        var $nameInput = $element.find('#pdf_edit_display_name');
                        var nameWithoutExt = file.name.replace(/\.pdf$/i, '');
                        $nameInput.val(nameWithoutExt);
                        
                        showNotification('success', gettext('Upload completed'));
                    }
                } catch (e) {
                    showNotification('error', gettext('Upload failed'));
                }
            } else {
                showNotification('error', gettext('Upload failed'));
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
    
    function updateUploadProgress(filename, progress) {
        var $item = $filesGrid.find('.pdf-file-item[data-filename="' + escapeHtml(filename) + '"]');
        $item.find('.pdf-item-progress').val(progress);
    }
    
    function savePdf() {
        var displayName = $element.find('#pdf_edit_display_name').val();
        var url = $urlInput.val().trim();
        var allowDownload = $element.find('#pdf_edit_allow_download').is(':checked');
        
        if (!url) {
            showNotification('error', gettext('Please select or upload a PDF file.'));
            return;
        }
        
        var data = {
            'display_name': displayName || 'PDF',
            'url': url,
            'allow_download': allowDownload ? 'True' : 'False',
            'source_text': '',
            'source_url': ''
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
        // Try to use dsAlert
        if (typeof dsAlert !== 'undefined') {
            dsAlert({
                title: message,
                type: type,
                timeout: type === 'error' ? 5000 : 3000,
                confirmText: null,
                cancelText: null
            });
        } else {
            // Fallback alert
            console.log('[' + type.toUpperCase() + '] ' + message);
            if (type === 'error') {
                alert(message);
            }
        }
    }
    
    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        
        var units = ['B', 'KB', 'MB', 'GB'];
        var k = 1024;
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        var size = (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1);
        
        return size + ' ' + units[i];
    }
    
    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    // if gettext not available
    if (typeof gettext === 'undefined') {
        window.gettext = function(str) { return str; };
    }
}
