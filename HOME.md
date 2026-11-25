---
title: HOME
created: 2026-07-06
updated: 2026-11-16
---

# 🏠 LLMWIKI Dashboard

> One wiki for the family. `household/` is shared; each person has their own private `people/<id>/` with the same PARA layout; `groups/<id>/` are shared by some of the family (a couple, the kids, a trip). Who is who → [[family|Family]] · Rules → [[agents|Agent Constitution]]

## 🗺 Areas

```dataview
TABLE WITHOUT ID file.link AS Area, regexreplace(file.folder, "/wiki/2-areas$", "") AS Whose, updated AS Updated
FROM "household/wiki/2-areas" OR "people" OR "groups"
WHERE type = "area"
SORT file.folder ASC, file.name ASC
```

## 🚧 Active Projects

```dataview
TABLE WITHOUT ID file.link AS Project, regexreplace(file.folder, "/wiki/1-projects$", "") AS Whose, area AS Area, updated AS Updated
FROM "household/wiki/1-projects" OR "people" OR "groups"
WHERE type = "project" AND project_status = "active"
SORT file.folder ASC, updated DESC
```

## ⏸ Paused Projects

```dataview
LIST regexreplace(file.folder, "/wiki/1-projects$", "")
FROM "household/wiki/1-projects" OR "people" OR "groups"
WHERE type = "project" AND project_status = "paused"
```

## ⚠ Needs Review (drafts / unverified)

```dataview
TABLE WITHOUT ID file.link AS Note, type AS Type, regexreplace(file.folder, "/wiki/.*$", "") AS Whose
FROM "household/wiki" OR "people" OR "groups"
WHERE status = "draft" AND type != "profile" AND contains(file.folder, "/wiki/")
SORT file.folder ASC, type ASC
```

## 🕒 Recently Updated

```dataview
TABLE WITHOUT ID file.link AS Note, regexreplace(file.folder, "/wiki/.*$", "") AS Whose, updated AS Updated
FROM "household/wiki" OR "people" OR "groups"
WHERE contains(file.folder, "/wiki/") AND type != "log"
SORT updated DESC
LIMIT 10
```

## 📥 Short-term memory (inboxes, open days, unprocessed sources)

```dataview
TABLE WITHOUT ID file.link AS Note, regexreplace(file.folder, "/(inbox|daily|raw/sources)$", "") AS Whose, choice(contains(file.folder, "inbox"), "inbox", choice(type = "daily", "daily", "source")) AS Kind
FROM "household" OR "people" OR "groups"
WHERE file.name != "README" AND (contains(file.folder, "/inbox") OR (type = "daily" AND status = "open") OR (type = "source" AND status = "unprocessed"))
SORT file.folder ASC
```

## 👪 People

```dataview
TABLE WITHOUT ID file.link AS Person, updated AS Updated
FROM "people"
WHERE type = "profile"
```

---

**Map:** [[Projects.base|All projects (sortable)]] · shared → `household/wiki/` · a person's own → `people/<id>/wiki/` (each has `1-projects`, `2-areas`, `3-resources`, `4-archive`)
