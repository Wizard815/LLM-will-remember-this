---
title: "{{title}}"
type: area
area: {{area}}
tags: [wiki, area]
created: {{date}}
updated: {{date}}
source: "{{source}}"
status: draft
related: []
---

# {{title}}

{{one or two sentences: what this area covers and the standard you keep it at}}

## Current state

{{content}}

## Active projects

```dataview
LIST
FROM "wiki/1-projects"
WHERE area = "{{area}}"
```

## Resources

```dataview
LIST
FROM "wiki/3-resources"
WHERE area = "{{area}}"
```

## Archive

```dataview
LIST
FROM "wiki/4-archive"
WHERE area = "{{area}}"
```
