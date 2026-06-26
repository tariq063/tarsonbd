# Tarsonbd — অর্ডার ফর্ম সেটআপ (ইমেইল / Google Sheet)

ফর্ম থেকে অর্ডার দুইভাবে নিতে পারেন। যেকোনো একটি বেছে নিন, তারপর
`js/script.js` ফাইলের একদম উপরে `ORDER_ENDPOINT` ও `ENDPOINT_TYPE` সেট করুন।

---

## অপশন A — ইমেইলে অর্ডার পাওয়া (সবচেয়ে সহজ) · Formspree

1. https://formspree.io এ গিয়ে ফ্রি সাইন আপ করুন।
2. **New Form** তৈরি করুন → আপনার ইমেইল দিন।
3. ফর্মের endpoint কপি করুন, যেমন: `https://formspree.io/f/abcdwxyz`
4. `js/script.js` এ সেট করুন:
   ```js
   const ORDER_ENDPOINT = 'https://formspree.io/f/abcdwxyz';
   const ENDPOINT_TYPE  = 'formspree';
   ```
✅ এখন প্রতিটি অর্ডার সরাসরি আপনার ইমেইলে চলে আসবে।

---

## অপশন B — Google Sheet এ অর্ডার জমা হওয়া

প্রতিটি অর্ডার একটি Google Sheet-এ নতুন সারি হিসেবে যোগ হবে।

### ধাপ ১: একটি Google Sheet তৈরি করুন
- https://sheets.new এ গিয়ে নতুন শিট খুলুন।
- হেডার নিয়ে চিন্তা করতে হবে না — নিচের কোড নিজেই হেডার সারি তৈরি করে নেবে।

### ধাপ ২: Apps Script যোগ করুন
- শিটে **Extensions → Apps Script** এ যান।
- সব কোড মুছে নিচের কোডটি পেস্ট করে **সেভ** করুন (Ctrl+S):

```javascript
// ⬇️ এখানে আপনার Meta Pixel ID ও CAPI Access Token বসান
var PIXEL_ID     = '1492316535975707';
var CAPI_TOKEN   = 'PASTE_YOUR_CONVERSIONS_API_ACCESS_TOKEN_HERE';
var TEST_EVENT_CODE = ''; // টেস্ট করার সময় Events Manager থেকে কোড বসান, লাইভে খালি রাখুন

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // প্রথমবার চললে হেডার সারি যোগ করে
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Order No', 'Order ID', 'Time', 'Product', 'Name', 'Phone', 'Address',
      'Quantity', 'Delivery Area', 'Delivery Charge', 'Subtotal', 'Total'
    ]);
  }

  // ক্রমিক অর্ডার নম্বর (১, ২, ৩...) — হেডার বাদে কতটি সারি আছে তার পরের সংখ্যা
  var orderNo = sheet.getLastRow();   // header = সারি ১, তাই প্রথম অর্ডার = ১

  var d = JSON.parse(e.postData.contents);
  sheet.appendRow([
    orderNo, d.orderId, d.time, d.product, d.name, d.phone, d.address,
    d.quantity, d.deliveryArea, d.deliveryCharge, d.subtotal, d.total
  ]);

  // ---- Meta Conversions API (server-side Purchase) ----
  try { sendPurchaseToCAPI(d); } catch (err) { /* CAPI fail করলেও অর্ডার সেভ হবে */ }

  return ContentService
    .createTextOutput(JSON.stringify({ result: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendPurchaseToCAPI(d) {
  if (!CAPI_TOKEN || CAPI_TOKEN.indexOf('PASTE_') === 0) return; // টোকেন না দিলে স্কিপ

  var userData = {
    ph: [sha256(normalizePhone(d.phone))],          // হ্যাশ করা ফোন
    fn: [sha256((d.name || '').trim().toLowerCase())] // হ্যাশ করা নাম
  };
  if (d.fbp) userData.fbp = d.fbp;
  if (d.fbc) userData.fbc = d.fbc;
  if (d.userAgent) userData.client_user_agent = d.userAgent;

  var event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: d.orderId,                 // ব্রাউজার Pixel-এর সাথে dedup হবে
    event_source_url: d.eventSourceUrl || '',
    action_source: 'website',
    user_data: userData,
    custom_data: {
      currency: 'BDT',
      value: Number(d.total) || 0,
      contents: [{ id: d.product, quantity: Number(d.quantity) || 1 }],
      content_type: 'product'
    }
  };

  var payload = { data: [event] };
  if (TEST_EVENT_CODE) payload.test_event_code = TEST_EVENT_CODE;

  var url = 'https://graph.facebook.com/v21.0/' + PIXEL_ID +
            '/events?access_token=' + encodeURIComponent(CAPI_TOKEN);

  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ফোন নম্বর normalize: শুধু ডিজিট, দেশের কোড 880 সহ (যেমন 8801712345678)
function normalizePhone(phone) {
  var p = String(phone || '').replace(/\D/g, '');
  if (p.indexOf('880') === 0) return p;
  if (p.indexOf('0') === 0)   return '880' + p.substring(1);
  return '880' + p;
}

// SHA-256 হ্যাশ (lowercase hex) — Meta CAPI-র জন্য আবশ্যক
function sha256(str) {
  if (!str) return '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
}
```

> ⚠️ **মনে রাখবেন:** উপরের **▶ Run** বাটনে ক্লিক করবেন না — তাহলে
> `Cannot read properties of undefined (reading 'postData')` এরর দেখাবে।
> কারণ ম্যানুয়ালি চালালে `e` (অর্ডার ডেটা) থাকে না। এই কোড শুধু আপনার
> ওয়েবসাইটের ফর্ম থেকেই চলবে। তাই **Run** নয়, নিচের মতো **Deploy** করুন।

### ধাপ ৩: ডিপ্লয় করুন
- **Deploy → New deployment** ক্লিক করুন।
- টাইপ: **Web app** বেছে নিন।
- **Execute as:** Me
- **Who has access:** **Anyone**
- **Deploy** চাপুন, অনুমতি দিন, তারপর **Web app URL** কপি করুন
  (শেষে `/exec` থাকবে)।

### ধাপ ৪: script.js এ বসান
```js
const ORDER_ENDPOINT = 'https://script.google.com/macros/s/XXXX/exec';
const ENDPOINT_TYPE  = 'sheet';
```
✅ এখন প্রতিটি অর্ডার আপনার Google Sheet-এ জমা হবে।

---

## ডেমো মোড
`ORDER_ENDPOINT = ''` রাখলে ফর্মটি শুধু একটি সফল বার্তা দেখাবে,
কোথাও ডেটা পাঠাবে না — পরীক্ষা করার জন্য সুবিধাজনক।

> পরামর্শ: ফোন নম্বর, হটলাইন, ইমেইল ও সোশ্যাল লিঙ্কগুলো `index.html`-এ
> `01XXX-XXXXXX`, `hello@tarsonbd.com`, `#` জায়গায় আপনার আসল তথ্য বসিয়ে নিন।
