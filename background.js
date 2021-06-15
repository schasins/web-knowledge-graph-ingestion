'use strict'

var popupIsOpen = false;

// control what happens when user clicks icon
chrome.browserAction.onClicked.addListener(function(tab){
  console.log(tab);
  var msg = triggerPopupInNewTab(tab.id, 0); // send to top-level frame!  only want to open popup in top-level frame
  chrome.tabs.sendMessage(tab.id, msg, {frameId: 0});
  popupIsOpen = true;
});

function triggerPopupInNewTab(tabid, frameid, msg=null){
  if (!msg){
    msg = {open_popup: true};
  }
  chrome.tabs.sendMessage(tabid, msg, {frameId: frameid});
  return msg;
}

// when a context script sends us a new thing that the user has highlighted, add it to our unplaced texts
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log(request, sender);
    if (request.msgtype === "postcsv"){

        var url = "http://localhost:5000/dobjs";
        var formData = new FormData();

        var blob = new Blob([request.datafile], { type: "text/csv"});
        formData.append("datafile", blob);
        var blob2 = new Blob([request.metadata], { type: "text/json"});
        formData.append("metadata", blob2);

        fetch(url, {
          method: 'POST',
          body: formData
        })
          .then(response => response.json())
          .then(data => {
            // do whatever with the data from the response
            console.log("response data", data);
          });



    }
  });