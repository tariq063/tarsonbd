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

  return ContentService
    .createTextOutput(JSON.stringify({ result: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
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
