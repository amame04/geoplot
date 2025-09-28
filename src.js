const map = L.map('map').setView([35.6812, 139.7671], 10); // tokyo
let path = [];
let drawPath = [];

const specifyDatetime = document.getElementById('specifyDatetime');
const startDatetime = document.getElementById('startDatetime');
const endDatetime = document.getElementById('endDatetime');

const url = new URL(window.location);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const layerGroup = L.layerGroup().addTo(map);

const draw = async (specifyPath = null) => {
  layerGroup.clearLayers();

  if (specifyPath != null) {
    path = specifyPath;
  }

  if (path.length === 0) {
    return;
  }

  if (specifyDatetime.checked) {
    const start = Date.parse(startDatetime.value);
    const end = Date.parse(endDatetime.value);

    drawPath = [];

    path.forEach((latlng, _) => {
      const time = latlng[2];
      if (start < time && time < end) {
        drawPath.push(latlng);
      }
    })

    url.searchParams.set('s', startDatetime.value);
    url.searchParams.set('e', endDatetime.value);

  } else {
    drawPath = path;
  }

  if (drawPath.length === 0) {
    return;
  }

  const polyline = L.polyline(drawPath, {
    color: 'black',
    weight: 3
  });
  layerGroup.addLayer(polyline);

  /*
  drawPath.forEach((latlng, _) => {
    const circle = L.circleMarker(latlng, {
      radius: 4,
      fillColor: 'black',
      color: 'white',
      weight: 1,
      fillOpacity: 0.8
    });
    layerGroup.addLayer(circle);
  });
  */

  map.fitBounds(polyline.getBounds());

  const str = JSON.stringify(drawPath);
  const compressed = await compress(str);
  url.searchParams.set('p', compressed);
  window.history.pushState({}, '', url);
}

specifyDatetime.addEventListener('change', () => draw());
startDatetime.addEventListener('change', () => draw());
endDatetime.addEventListener('change', () => draw());

document.getElementById('timelineFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = (event) => {
    const json = JSON.parse(event.target.result);

    // semanticSegments から timelinePath を抽出
    json.semanticSegments.forEach(segment => {
      if (!segment.timelinePath) return;
      segment.timelinePath.forEach(entry => {
        const point = entry.point.replace('°', '').split(',').map(v => parseFloat(v.trim()));
        const time = Date.parse(entry.time);
        if (point.length === 2 && time != NaN) {
          path.push([point[0], point[1], time]);
        }
      });
    });

    draw();
  };

  reader.readAsText(file);
});

document.getElementById('tokml').addEventListener('click', () => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(`<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2">
      <Document>
        <Style id="2">
          <LineStyle id="3">
              <colorMode>normal</colorMode>
              <width>3</width>
          </LineStyle>
        </Style>
        <Placemark id="5">
            <name>timeline</name>
            <styleUrl>#2</styleUrl>
            <LineString id="4">
            </LineString>
        </Placemark>
      </Document>
    </kml>
  `, 'application/xml');

  const coordinates = xml.createElement('coordinates');
  drawPath.forEach((latlng, _) => {
    coordinates.textContent += latlng[1] + ',' + latlng[0] + ',0.0 '
  })

  xml.getElementsByTagName('LineString')[0].appendChild(coordinates);

  const serializer = new XMLSerializer();
  const kml = serializer.serializeToString(xml);

  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'timeline.kml';
  a.click();

  URL.revokeObjectURL(url);
})

document.getElementById('clear').addEventListener('click', () => {
  url.searchParams.delete('s');
  url.searchParams.delete('e');
  url.searchParams.delete('p');
  window.history.replaceState({}, '', url);
  window.location.reload();
})

const compress = async (target) => {
  const arrayBufferToBinaryString = (arrayBuffer) => {
    const bytes = new Uint8Array(arrayBuffer);

    let binaryString = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }

    return binaryString;
  };

  const blob = new Blob([target]);
  const stream = blob.stream();
  const compressedStream = stream.pipeThrough(
    new CompressionStream('gzip')
  );

  const buf = await new Response(compressedStream).arrayBuffer();

  const binaryString = arrayBufferToBinaryString(buf);
  const encodedByBase64 = btoa(binaryString);
  return encodedByBase64;
};

const decompress = async (target) => {
  const binaryStringToBytes = (str) => {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    return bytes;
  };

  const decodedByBase64 = atob(target);
  const bytes = binaryStringToBytes(decodedByBase64);

  const stream = new Blob([bytes]).stream();

  const decompressedStream = stream.pipeThrough(
    new DecompressionStream('gzip')
  );

  return await new Response(decompressedStream).text();
};

const init = async () => {
  const start = url.searchParams.get('s');
  const end = url.searchParams.get('e');
  const compressedPaths = url.searchParams.get('p')

  if (start) {
    specifyDatetime.checked = true;
    startDatetime.value = start
  }

  if (end) {
    specifyDatetime.checked = true;
    endDatetime.value = end
  }

  if (compressedPaths) {
    const restoredPaths = JSON.parse(await decompress(compressedPaths));
    draw(restoredPaths);
  }
}

init();
