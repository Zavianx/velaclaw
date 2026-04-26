---
summary: "Status of Apple device model metadata in the public repository"
read_when:
  - Looking for device model identifier mappings
title: "Device Model Database"
---

# Device Model Database

The public repository no longer vendors Apple device model identifier JSON files
for a native macOS companion app. The supported public build path is the
Gateway/CLI runtime.

If a native client needs friendly Apple model names, keep that mapping in the
native-client repository that owns the UI and its release pipeline.
