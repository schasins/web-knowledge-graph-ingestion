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
    if (request.selectedtext){
      unplacedTexts.push(request.selectedtext);
      console.log(unplacedTexts);
      sendNewState();
    }
  });