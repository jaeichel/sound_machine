const request = require('request');
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');

const consumer = {
  key: '25b0508269c6b500f57b0013ec2369e7e8cc0813c992d4fe9442743fdee0',
  secret: '1dc3293923b0133b76001d2cd52eb5f4decc64dbb53c2fb74130153bd7c7'
};
const token = {
  key: '17b9219bd3be518e24f6c0cc05c9cdb39b21201592849680fcc11d368446525',
  secret: '9bdf27e47805e56fbc2480e2f9c747559d5dcf44def1f198feb628e449f'
};

const deviceId = '0';
const userId = '14438849';

function nokiaAuthGet(url, data) {
  data.deviceid = deviceId;
  data.userid = userId;

  function hash_function_sha1(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  }

  const oauth = OAuth({
    consumer: consumer,
    signature_method: 'HMAC-SHA1',
    hash_function: hash_function_sha1
  });

  const requestData = {
    url: url,
    method: 'GET',
    data: data
  };

  let formData = oauth.authorize(requestData, token);
  let urlParameters = [...Object.entries(formData)].map(
    e => encodeURIComponent(e[0]) + "=" + encodeURIComponent(e[1])
  );
  let signedUrl = requestData.url + '?';
  for (let i=0; i<urlParameters.length; ++i) {
    if (i == 0) {
      signedUrl += urlParameters[i];
    } else {
      signedUrl += '&' + urlParameters[i];
    }
  }

  return new Promise((resolve, reject) => {
    request({
      url: signedUrl,
      method: 'GET'
    }, function(error, response, body) {
      if (error) {
        reject(error);
      } else {
        resolve(JSON.parse(body));
      }
    });
  });
}

module.exports = nokiaAuthGet;
