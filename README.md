# Web Knowledge Graph Ingestion

This repository contains a prototype extension for
[Google Chrome](https://www.google.com/chrome/)
for _web knowledge graph ingestion_,
the process of taking semi-structured data from normal websites and loading it
into a
[knowledge graph](https://web.stanford.edu/~vinayc/kg/notes/What_is_a_Knowledge_Graph.html).

## Getting Started

The following three sections describe how to get started with this extension.

### How to Install

1. Install [Google Chrome](https://www.google.com/chrome/).

1. [Create a new user profile for Google Chrome](https://support.google.com/chrome/answer/2364824)
   to ensure that no other extensions interfere with the one contained in this
   repository.

1. Clone this `git` repository and note the location of the folder that you
   clone it into:

```
git clone https://github.com/UChicago-PL/smyth.git
```

1. In the new Google Chrome user profile, paste `chrome://extensions/` into your
   URL bar to load a page that lists all your extensions.

1. Enable developer mode. If developer mode is not currently enabled, click the
   toggle switch next to the text "Developer mode" to turn it on.

1. Click the "Load unpacked" button and select the folder that you cloned this
   `git` repo into.

1. Click the puzzle piece icon that appears in the top-right of Chrome and pin
   the "Web Knowledge Graph Ingestion" extension.

### Example Usage

This mini example will demonstrate how the extension can extract data from a
highly-structured HTML table into a CSV.

1. In the Web Knowledge Graph Ingestion Chrome user profile, navigate to
   [Wikipedia's list of tallest mountains](https://en.wikipedia.org/wiki/List_of_mountain_peaks_by_prominence).

1. Scroll down to the table titled "The 125 most topographically prominent
   summits on Earth"

1. Click the Web Knowledge Graph Ingestion extension in the top-right of Chrome.

1. Click the "Click here to enter data demonstration mode instead" button

1. Click any cell in the table.

### Reloading the Extension

When modifying this extension, you will need to reload it in Chrome to see the
effects of your changes. Here is how to do so:

1. In the Web Knowledge Graph Ingestion Chrome user profile, navigate to
   `chrome://extensions/`

1. Click the gray circular reload button in the bottom-right of the Web
   Knowledge Graph Ingestion extension.

Any changes made to the extension should now be active in Chrome.
