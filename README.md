# Daily English Journal 📔

تطبيق ويب بسيط (Flask + SQLite) يعطيك مهمة كتابة قصيرة كل يوم باللغة الإنجليزية،
ثم يصحّح كتابتك ويشرح الأخطاء بالعربية باستخدام OpenAI.
يعمل في المتصفح ويمكن تثبيته على الـ iPad كـ PWA من شاشة Add to Home Screen.

---

## 1) متطلبات التشغيل

- Python 3.10 أو أحدث
- مفتاح OpenAI API (احصل عليه من <https://platform.openai.com/api-keys>)

---

## 2) التشغيل محليًا

```bash
# 1. أنشئ البيئة الافتراضية
python -m venv venv
source venv/bin/activate          # على Windows: venv\Scripts\activate

# 2. ثبّت المكتبات
pip install -r requirements.txt

# 3. أنشئ ملف .env من القالب وضع مفتاحك بداخله
cp .env.example .env
# ثم افتح ملف .env وعدّل OPENAI_API_KEY=...

# 4. شغّل التطبيق
python app.py
```

بعدها افتح المتصفح على:
<http://127.0.0.1:5000>

أول تشغيل سيُنشئ ملف `database.db` تلقائيًا.

---

## 3) فتح التطبيق على iPad وتثبيته كـ PWA

### أ. اجعل الـ iPad واللاب توب على نفس شبكة الـ Wi-Fi.

### ب. اكتشف عنوان IP الخاص بجهازك:
- **macOS**:
  ```bash
  ipconfig getifaddr en0
  ```
- **Linux**:
  ```bash
  hostname -I | awk '{print $1}'
  ```
- **Windows**: `ipconfig` ثم انظر إلى IPv4 Address.

ستحصل على شيء مثل: `192.168.1.42`

### ج. على الـ iPad
1. افتح Safari (وليس Chrome — التثبيت كـ PWA على iOS يدعمه Safari فقط).
2. اذهب إلى: `http://192.168.1.42:5000`
3. اضغط زر المشاركة (Share) في الأعلى.
4. اختر **Add to Home Screen** ← ثم Add.

سيظهر التطبيق على الشاشة الرئيسية بأيقونة الدفتر، ويفتح ملء الشاشة بدون شريط Safari.

> ملاحظة: Service Worker على iOS يعمل فقط مع `https://` أو `localhost`.
> عبر `http://192.168.x.x` التطبيق يعمل لكن دون تخزين مؤقت للعمل أوفلاين.
> هذه نقطة ستحلّها لاحقًا عند الرفع على Render/Railway حيث تحصل على HTTPS تلقائيًا.

---

## 4) هيكل المشروع

```
daily_english_journal/
├── app.py                  # خادم Flask + منطق OpenAI + الـ DB
├── requirements.txt
├── .env.example            # انسخه إلى .env وضع مفتاحك
├── README.md
├── templates/
│   └── index.html          # الصفحة الرئيسية
└── static/
    ├── style.css
    ├── app.js
    ├── manifest.json       # PWA manifest
    ├── service-worker.js   # PWA service worker
    ├── icon-180.png        # apple-touch-icon
    ├── icon-192.png
    ├── icon-512.png
    └── icon.png
```

`database.db` يُنشأ تلقائيًا في أول تشغيل.

---

## 5) كيف يعمل التصحيح

عند الضغط على **Correct My Writing**:

1. الواجهة ترسل `{ text, prompt }` إلى `/api/correct`.
2. الخادم يستدعي OpenAI مع تعليمات نظام (system prompt) صارمة تطلب JSON بهذه الصيغة:

```json
{
  "corrected_text": "...",
  "mistakes": [
    { "wrong": "...", "correct": "...", "explanation_ar": "..." }
  ],
  "general_explanation_ar": "...",
  "score": 8
}
```

3. النتيجة تُحفظ في جدول `entries` ثم تُرجَع للواجهة لعرضها.
4. يمكنك مراجعة كل الكتابات السابقة من تبويب **Archive**.

النموذج الافتراضي هو `gpt-4o-mini` (سريع ورخيص). لتغييره ضع في `.env`:

```
OPENAI_MODEL=gpt-4o
```

---

## 6) واجهات API (للاختبار)

| Method | Path                  | الوصف                                   |
|--------|-----------------------|-----------------------------------------|
| GET    | `/`                   | الصفحة الرئيسية                          |
| POST   | `/api/correct`        | يستقبل `{text, prompt}` ويصحّح ويحفظ     |
| GET    | `/api/entries`        | كل الكتابات السابقة (مرتبة من الأحدث)    |
| DELETE | `/api/entries/<id>`   | حذف كتابة                                |
| GET    | `/healthz`            | فحص صحة الخادم                           |

---

## 7) النشر لاحقًا (Render / Railway / VPS)

التطبيق جاهز للنشر بدون تغييرات تذكر. اختصارًا:

- **Render / Railway**: ارفع الريبو، أضف متغير البيئة `OPENAI_API_KEY`,
  واجعل أمر التشغيل:
  ```
  gunicorn app:app
  ```
  (أضف `gunicorn` إلى `requirements.txt` قبل الرفع.)
- **VPS**: شغّله خلف Nginx + gunicorn و فعّل HTTPS عبر Let's Encrypt.
  حينها يعمل Service Worker كاملاً ويعمل التطبيق أوفلاين على iPad.

تذكّر أن SQLite ملف محلي — إذا أردت أن تستمر البيانات بعد إعادة النشر،
استخدم Volume على المنصة أو انتقل إلى Postgres لاحقًا.

---

## نصائح صغيرة للاستخدام اليومي
- اكتب أولًا بدون الخوف من الأخطاء، ثم اضغط Correct.
- اقرأ الشرح العربي بهدوء وحاول كتابة جملة جديدة تستخدم القاعدة نفسها.
- راجع الـ Archive مرة في الأسبوع لترى تحسّنك.

استمتع بالكتابة 🌿
