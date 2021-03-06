/* Javascript for pdfXBlock. */
function pdfXBlockInitView(runtime, element, json) {
    /* Weird behaviour :
     * In the LMS, element is the DOM container.
     * In the CMS, element is the jQuery object associated*
     * So here I make sure element is the jQuery object */
    if (element.innerHTML) {
        element = $(element);
    }

    $('.pdf-h5-container').attr('data', '/xblock/resources/pdf/public/web/viewer.html?file='+json.url)

    $(function () {
        element.find('.pdf-download-button').on('click', function () {
            var handlerUrl = runtime.handlerUrl(element, 'on_download');
            $.post(handlerUrl, '{}');
        });
    });
}

window.pdfXBlockInitView = pdfXBlockInitView;
