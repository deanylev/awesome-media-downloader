$(document).ready(() => {
  let inFlight = false;

  function status(text, bsClass) {
    $('#status').removeClass().addClass(bsClass ? `text-${bsClass}` : '').text(text || '');
  }

  $('form').submit(() => {
    if (!$('#urls').val()) {
      status('Please enter at least one URL.', 'danger');
      return false;
    }

    if (inFlight) {
      return false;
    }

    let urls = $('#urls').val().split('\n');
    let format = $('#format').val()
    let totalVideos = urls.length;
    let videoNumber = 1;

    function downloadVideo() {
      if (!urls.length) {
        setTimeout(() => {
          inFlight = false;
          status('Video downloading complete.');
          $('.progress-bar').removeClass('bg-danger').empty().css('width', '0%');
        }, 1500);

        return;
      }

      inFlight = true;

      let url = urls.shift();
      $('.fa-spinner').removeClass('d-none');

      $.ajax({
        dataType: 'json',
        method: 'POST',
        url: '/download',
        data: {
          url,
          format
        },
        complete: () => {
          $('.fa-spinner').addClass('d-none');
          $('.progress-bar').removeClass('bg-danger').empty().css('width', '0%');
          videoNumber++;
        },
        success: (response) => {
          let fileSize = response.fileSize;
          let fileName = encodeURIComponent(response.fileName);
          let tempFile = response.tempFile;
          let fileStatus = `"${response.fileName}" (Video ${videoNumber}/${totalVideos})`;
          status(`Downloading ${fileStatus}`);
          let checkStatus = setInterval(() => {
            $.getJSON('/download_status', {
              tempFile,
              fileSize
            }).done((response) => {
              switch (response.status) {
                case 'complete':
                  clearInterval(checkStatus);
                  window.location.href = `/download_file?video=${fileName}`;
                  downloadVideo();
                  break;
                case 'transcoding':
                  status(`Converting ${fileStatus}`);
                default:
                  let progress = `${(response.progress * 100).toFixed(2)}%`;
                  $('.progress-bar').text(progress).css('width', progress);
              }
            }).fail(() => {
              clearInterval(checkStatus);
              $('.progress-bar').addClass('bg-danger').text('Error').css('width', '100%');
            });
          }, 1000);
        },
        error: (response) => {
          let error;
          if (response.status === 500) {
            error = `Sorry, looks like that URL isn't supported.`;
          } else {
            error = 'An error occured.';
          }
          status(`${error} (Video ${videoNumber}/${totalVideos})`, 'danger');
          downloadVideo();
        }
      });
    }

    downloadVideo();

    return false;
  });
});
