function codeInject() {
  if (window.oldContext === undefined) {
    window.oldContext = context;
  }

  var newContext = {};
  for (let key in oldContext) {
    if (typeof oldContext[key] === 'function') {
      let f = function(...params) {
        console.log(key);
        return oldContext[key](...params);
      };
      f.bind(newContext);
      newContext[key] = f;
    } else {
      newContext[key] = oldContext[key];
    }
  }
  var dest = newContext.createMediaStreamDestination();
  var gainNode = newContext.createGain();
  gainNode.connect(dest);
  gainNode.gain.value = 2;
  newContext.destination = gainNode;
  context = newContext;

  var createAudioPlayer = function() {
    let audio = document.createElement('audio');
    audio.id = 'audioPlayer';
    let player = document.getElementsByClassName('player')[0];
    player.appendChild(audio);
  }

  if (document.getElementById('audioPlayer') === null) {
    createAudioPlayer();
  }

  window.getBigTitle = function() {
    return document.getElementsByClassName('bigTitle')[0].innerHTML.slice(
      0, document.getElementsByClassName('bigTitle')[0].innerHTML.indexOf('<')
    ).trim();
  }

  window.getSubTitle = function() {
    return document.getElementsByClassName('subTitle')[0].innerHTML.trim();
  }

  window.getDownloadBlob = function(blob) {
    var e = document.createEvent('MouseEvents');
    var a = document.createElement('a');
    a.download = getBigTitle() + ' - ' + getSubTitle + '.ogg';
    a.href = window.URL.createObjectURL(blob);
    a.dataset.downloadurl =  ['audio/ogg; codecs=opus', a.download, a.href].join(':');
    e.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    a.dispatchEvent(e);
  }

  var chunks = [];
  var blob = undefined;
  var myCounter = 0;
  var myTotal = 1;
  var myInterval;
  window.record = function(timeout_ms) {
    clearInterval(myInterval);
    chunks = [];
    blob = undefined;
    var mediaRecorder = new MediaRecorder(dest.stream);
    mediaRecorder.ondataavailable = function(evt) {
      chunks.push(evt.data);
    };
    mediaRecorder.onstop = function(evt) {
      console.log('chunks', chunks.length);
      blob = new Blob(chunks, { 'type' : 'audio/ogg; codecs=opus' });
      let audio = document.getElementById('audioPlayer');
      audio.src = URL.createObjectURL(blob);
      console.log(audio.src);

      var div = document.getElementById('msg');
      div.innerHTML = '<a href="' + audio.src + '">download</a>';

      getDownloadBlob(blob);
    };

    mediaRecorder.start();
    var div = document.getElementById('msg');
    div.innerHTML = 'recording...';
    myCounter = 0;
    myTotal = timeout_ms / 1000;
    myInterval = setInterval(() => {
      let percent = (myCounter / myTotal * 100).toFixed(2);
      ++myCounter;
      if (myCounter < myTotal) {
        div.innerHTML = 'recording (' + percent + '%)...';
      }
    }, 1000);
    setTimeout(() => {
      clearInterval(myInterval);
      mediaRecorder.requestData();
      mediaRecorder.stop();
    },  timeout_ms);
  }

  finishedLoading();
}
