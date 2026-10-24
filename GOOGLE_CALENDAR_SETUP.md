# Google Calendar setup (about 10 minutes, free)

Do this once. Use the same Google Cloud project that Firebase created for UFlow
(it has the same name as your Firebase project).

## 1. Turn on the Calendar API
1. Open https://console.cloud.google.com and pick your UFlow / Firebase project at the top.
2. Menu > APIs & Services > Library > search "Google Calendar API" > Enable.

## 2. Allow your Google account to test
1. Menu > APIs & Services > OAuth consent screen (may be called "Google Auth Platform").
2. Audience: keep "Testing" and add your own Gmail under Test users.
3. Data Access (or Scopes) > Add scope: `.../auth/calendar.events` > Save.

## 3. Create the client ID
1. Menu > APIs & Services > Credentials > Create credentials > OAuth client ID.
2. Application type: Web application.
3. Authorised JavaScript origins, add both:
   - http://localhost:5173
   - your live site address, for example https://uflow.vercel.app (no slash at the end)
4. Leave redirect URIs empty. Create, then copy the Client ID.

## 4. Add it to UFlow
- Locally: put `VITE_GOOGLE_CLIENT_ID=<your client id>` in `.env.local`, then stop and restart `npm run dev`.
- On Vercel: Project > Settings > Environment Variables > add the same name and value, then redeploy.

## 5. Use it
Open Calendar > Connect Google Calendar. Google will say "hasn't verified this app":
click Advanced > Go to UFlow (unsafe) > Allow. That warning is normal for a personal project in Testing mode.

Notes
- Google only gives a 1-hour pass. After that the button says "Reconnect Google Calendar"; one click renews it.
- Events you add in UFlow with "Also add to my Google Calendar" ticked appear in Google too.
- While in Testing mode, Google may ask you to approve again about once a week. That is expected.
