const fs = require('fs');
const path = require('path');

// Simple GPX parser
function parseGPX(gpxContent) {
  const trkptRegex = /<trkpt lat="([^"]+)" lon="([^"]+)">[^]*?<ele>([^<]+)<\/ele>/g;
  const points = [];
  let match;

  while ((match = trkptRegex.exec(gpxContent)) !== null) {
    points.push({
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2]),
      ele: parseFloat(match[3])
    });
  }

  return points;
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Process trail data
function processTrail(points) {
  if (points.length === 0) return null;

  let totalDistance = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  let maxElevation = points[0].ele;
  let minElevation = points[0].ele;

  const path = [];

  for (let i = 0; i < points.length; i++) {
    const point = points[i];

    // Update min/max elevation
    if (point.ele > maxElevation) maxElevation = point.ele;
    if (point.ele < minElevation) minElevation = point.ele;

    // Calculate distance
    if (i > 0) {
      const prevPoint = points[i - 1];
      const dist = calculateDistance(prevPoint.lat, prevPoint.lng, point.lat, point.lng);
      totalDistance += dist;

      // Calculate elevation change
      const elevChange = point.ele - prevPoint.ele;
      if (elevChange > 0) {
        elevationGain += elevChange;
      } else {
        elevationLoss += Math.abs(elevChange);
      }
    }

    path.push({
      lat: point.lat,
      lng: point.lng,
      ele: Math.round(point.ele),
      dist: Math.round(totalDistance * 100) / 100
    });
  }

  // Generate waypoints (start, ~1/3, ~2/3, end)
  const waypoints = [
    [points[0].lat, points[0].lng, Math.round(points[0].ele)],
    [points[Math.floor(points.length / 3)].lat, points[Math.floor(points.length / 3)].lng, Math.round(points[Math.floor(points.length / 3)].ele)],
    [points[Math.floor(2 * points.length / 3)].lat, points[Math.floor(2 * points.length / 3)].lng, Math.round(points[Math.floor(2 * points.length / 3)].ele)],
    [points[points.length - 1].lat, points[points.length - 1].lng, Math.round(points[points.length - 1].ele)]
  ];

  // Generate coordinates array (just lat/lng)
  const coordinates = points.map(p => [p.lat, p.lng]);

  return {
    distance: Math.round(totalDistance * 10) / 10,
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    maxElevation: Math.round(maxElevation),
    minElevation: Math.round(minElevation),
    waypoints,
    path,
    coordinates
  };
}

// Estimate duration based on distance and elevation
function estimateDuration(distance, elevationLoss) {
  // Rough estimate: ~15-20 mins per km for descents
  const minutes = Math.round((distance / 0.15) * (1 + elevationLoss / 3000));
  return `${minutes} mins`;
}

// Main processing
const gpxDir = path.join(__dirname, 'gpx');
const metadataPath = path.join(__dirname, 'trail-metadata.json');
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

const trailsData = [];

metadata.trails.forEach(trail => {
  console.log(`Processing ${trail.name}...`);

  let gpxFileName = trail.gpxFile;

  // Check if file exists with trimmed_ prefix
  const trimmedName = 'trimmed_' + trail.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_') + '.gpx';
  const possibleNames = [
    trail.gpxFile,
    trimmedName,
    'trimmed_' + trail.name.replace(/[^a-zA-Z0-9]/g, '_') + '.gpx'
  ];

  let gpxPath = null;
  for (const name of possibleNames) {
    const testPath = path.join(gpxDir, name);
    if (fs.existsSync(testPath)) {
      gpxPath = testPath;
      gpxFileName = name;
      break;
    }
  }

  if (!gpxPath) {
    console.log(`  ⚠️  GPX file not found for ${trail.name}`);
    return;
  }

  const gpxContent = fs.readFileSync(gpxPath, 'utf8');
  const points = parseGPX(gpxContent);

  if (points.length === 0) {
    console.log(`  ⚠️  No points found in GPX for ${trail.name}`);
    return;
  }

  const processedData = processTrail(points);

  const trailData = {
    id: trail.id,
    name: trail.name,
    region: trail.region,
    difficulty: trail.difficulty,
    distance: processedData.distance,
    elevationGain: processedData.elevationGain,
    elevationLoss: processedData.elevationLoss,
    maxElevation: processedData.maxElevation,
    minElevation: processedData.minElevation,
    duration: estimateDuration(processedData.distance, processedData.elevationLoss),
    stravaUrl: trail.stravaUrl,
    previewVideoId: trail.previewVideoId,
    previewStart: trail.previewStart,
    povVideoUrl: trail.povVideoUrl,
    waypoints: processedData.waypoints,
    description: trail.description,
    path: processedData.path,
    coordinates: processedData.coordinates,
    gpxPath: `gpx/${gpxFileName}`
  };

  console.log(`  ✓ ${trail.name}: ${processedData.distance}km, ${processedData.elevationLoss}m descent, ${points.length} points`);
  trailsData.push(trailData);
});

// Write output
const output = `// Alpes-Maritimes MTB Trails Data
// Auto-generated by process-gpx.js

const trailsData = ${JSON.stringify(trailsData, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, 'js', 'trails-data.js'), output);
console.log(`\n✓ Generated trails-data.js with ${trailsData.length} trails`);
