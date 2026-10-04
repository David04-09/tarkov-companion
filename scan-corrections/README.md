# Stash scanner corrections

Files exported from the app (Item Collection → Scan screenshot → Your corrections → Export) go here.
`npm run scan:fingerprints` bundles every record as an extra reference, so the next release recognises
those items for everyone. `npm run scan:check` uses them as test images and reports how many the base
matcher still gets wrong.
