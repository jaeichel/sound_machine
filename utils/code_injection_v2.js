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
  gainNode.gain.value = 4;
  newContext.destination = gainNode;
  context = newContext;

  var speakerGain = newContext.createGain();
  speakerGain.connect(oldContext.destination);
  speakerGain.gain.value = 1;
  gainNode.connect(speakerGain);

  window.dest = dest;
  window.gainNode = gainNode;
  window.speakerGain = speakerGain;

  window.muteSpeaker = () => {
    let a = document.getElementById('toggleMuteA');
    a.innerHTML = 'unmute';
    const duration = 100;
    const step = 1.0 / duration;
    const timeDuration = 2;
    for (let gain=1.0; gain >= 0; gain -= step) {
      let roundedGain = Math.min(Math.max(0, Math.round(gain*100) / 100), 1);
      window.speakerGain.gain.setValueAtTime(
        roundedGain,
        window.gainNode.context.currentTime + (1-gain) * timeDuration
      );
    }
  }
  window.unmuteSpeaker = () => {
    let a = document.getElementById('toggleMuteA');
    a.innerHTML = 'mute';
    const duration = 100;
    const step = 1.0 / duration;
    const timeDuration = 2;
    for (let gain=0; gain <= 1; gain += step) {
      let roundedGain = Math.min(Math.max(0, Math.round(gain*100) / 100), 1);
      window.speakerGain.gain.setValueAtTime(
        roundedGain,
        window.gainNode.context.currentTime + gain * timeDuration
      );
    }
  }
  window.toggleSpeaker = () => {
    if (Math.round(window.speakerGain.gain.value) === 0) {
      window.unmuteSpeaker();
    } else {
      window.muteSpeaker();
    }
  };

  var createAudioPlayer = function() {
    let audio = document.createElement('audio');
    audio.id = 'audioPlayer';
    let player = document.getElementsByClassName('player')[0];
    player.appendChild(audio);
  }

  var createDivContainer = function() {
    var divContainer = document.getElementById('msg');

    var newMsg = document.createElement('div');
    newMsg.id = 'msg';
    newMsg.class = 'msg';
    newMsg.innerHTML = divContainer.innerHTML;

    var muteDiv = document.createElement('span');
    muteDiv.id = 'recordDiv';
    muteDiv.class = 'msg';
    muteDiv.innerHTML = '<a href="#" id="toggleMuteA" onclick="toggleSpeaker();">mute</a>';

    var spacer = document.createElement('span');
    spacer.innerHTML = ' | ';

    var recordDiv = document.createElement('span');
    recordDiv.id = 'recordDiv';
    recordDiv.class = 'msg';
    recordDiv.innerHTML = '<a href="#" onclick="record(60*60*1000);">record</a>';

    var recordDivContainer = document.createElement('div');
    recordDivContainer.appendChild(muteDiv);
    recordDivContainer.appendChild(spacer);
    recordDivContainer.appendChild(recordDiv);

    divContainer.setAttribute('id', 'divContainer');
    divContainer.innerHTML = '';
    divContainer.appendChild(newMsg);
    divContainer.appendChild(recordDivContainer);
  }

  if (document.getElementById('audioPlayer') === null) {
    createAudioPlayer();
    createDivContainer();
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
    a.download = getBigTitle() + ' - ' + getSubTitle() + '.ogg';
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

      var div = document.getElementById('recordDiv');
      div.innerHTML = '<a href="' + audio.src + '">download</a>';

      getDownloadBlob(blob);
    };

    mediaRecorder.start();
    var div = document.getElementById('recordDiv');
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
}

function loadAllSounds() {
  console.log('injected loadAllSounds');
	if (bWEBAUDIO==1) {
	  if (typeof AudioContext !== 'undefined') {context = new AudioContext();}
	  else {context = new webkitAudioContext();}
    codeInject();

	  for (var i = 0; i < iNUMBERBANDS; ++i) loadWebAudioSound(sourceFileA[i],i);
	  for (var i = 0; i < iNUMBERBANDS; ++i) loadWebAudioSound(sourceFileB[i],i+iNUMBERBANDS);
	}
	else{
		for (var i = 0; i < iNUMBERBANDS; ++i) loadHTML5AudioSound(i);
	}
}
