  // File to store strings for diffrent languages


  // Utils
  function getErrorMessage(lang, statusCode) {
    if(lang.has(statusCode)) return lang.get(statusCode);
    return lang.get('Unknown').concat(" Error code: ") + statusCode;
  } 
  
  function MSG(lang, message) {
    if(lang.has(message)) return lang.get(message);
    console.warn("Could not find key " + message + " for lang "+lang);
    return "";
  }
  
  //Declare Maps
  var EN_US = new Map();

  // Main
  EN_US.set(400, 'Server said this request was invalid"')
     .set(429, 'You have submitted too many sponsor times for this one video, are you sure there are this many?')
     .set(409, 'This has already been submitted before')
     .set(502, 'It seems the server is down. Contact the dev to inform them.')
     .set('Unknown', 'There was an error submitting your sponsor times, please try again later.');
