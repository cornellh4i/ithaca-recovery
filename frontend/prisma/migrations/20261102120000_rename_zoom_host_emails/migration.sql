-- ICR renamed three existing Zoom users' emails on 2026-11 (same Zoom user IDs, meetings
-- intact) -- the old addresses now 404 at the Zoom API, and conflict bucketing compares stored
-- emails against ZOOM_HOSTS, so stored hosts must follow the rename. Case-insensitive because
-- stored casing can differ from Zoom's (#504). No-op on dev/test databases.
UPDATE "Meeting" SET "zoomHost" = CASE lower("zoomHost")
    WHEN '518board@gmail.com' THEN 'zoom2@518icr.com'
    WHEN 'zoomhost2@518icr.com' THEN 'zoom3@518icr.com'
    WHEN 'it@518icr.com' THEN 'zoom4@518icr.com'
  END
WHERE lower("zoomHost") IN ('518board@gmail.com', 'zoomhost2@518icr.com', 'it@518icr.com');

UPDATE "Meeting" SET "attemptedZoomHost" = CASE lower("attemptedZoomHost")
    WHEN '518board@gmail.com' THEN 'zoom2@518icr.com'
    WHEN 'zoomhost2@518icr.com' THEN 'zoom3@518icr.com'
    WHEN 'it@518icr.com' THEN 'zoom4@518icr.com'
  END
WHERE lower("attemptedZoomHost") IN ('518board@gmail.com', 'zoomhost2@518icr.com', 'it@518icr.com');
