# Enabling Google sign-in

Three places have to agree on the redirect URL or the callback fails silently.

## 1 · Google Cloud Console

**APIs & Services → Credentials → Create OAuth client ID → Web application**

Authorised JavaScript origins:
```
http://localhost:5173
https://your-domain.com
```

Authorised redirect URIs — this is Supabase's URL, not yours:
```
https://<project-ref>.supabase.co/auth/v1/callback
```

Copy the client ID and client secret.

## 2 · Supabase

**Authentication → Providers → Google** — enable it, paste the client ID and secret.

**Authentication → URL Configuration:**

| Field | Value |
|---|---|
| Site URL | `http://localhost:5173` (dev) / your domain (prod) |
| Redirect URLs | `http://localhost:5173/auth/callback`, `https://your-domain.com/auth/callback` |

Missing the redirect URL entry is the usual cause of "requested path is invalid".

## 3 · The app

Already wired:

- `lib/auth.jsx` → `signInWithGoogle()` calls `signInWithOAuth` with
  `redirectTo: ${window.location.origin}/auth/callback`.
- `pages/auth/Callback.jsx` waits for the session, then routes by role.
- Migration `0002` adds the `on_auth_user_created` trigger.

## Why the trigger matters

An OAuth user never sees a registration form, so nothing in the client creates their
`profiles` row. The trigger creates it from `raw_user_meta_data` the moment the auth user is
inserted — name from Google, role `citizen`, language `en`.

The callback polls for that row up to five times over two seconds, because the trigger can
land fractionally after the session does. Without the poll, the first load occasionally routes
a brand-new Google user as though they had no role.

## Promoting a Google user to staff

Signing in with Google always produces a citizen. Staff access is granted deliberately:

```sql
update profiles set role = 'officer' where id = '<uuid>';
insert into officers (id, department_id, base_location)
values ('<uuid>', (select id from departments where code = 'ROADS'),
        st_setsrid(st_makepoint(72.9010, 19.0720), 4326)::geography);
```
