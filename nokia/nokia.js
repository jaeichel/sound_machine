const request = require('request');
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');

const consumer = {
  key: 'xxx',
  secret: 'xxx'
};
const token = {
  key: 'xxx',
  secret: 'xxx'
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
