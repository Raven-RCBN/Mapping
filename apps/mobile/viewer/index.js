import Map from 'ol/Map';
import View from 'ol/View';
import ImageLayer from 'ol/layer/Image';
import VectorLayer from 'ol/layer/Vector';
import ImageStatic from 'ol/source/ImageStatic';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { transformExtent, fromLonLat } from 'ol/proj';
import { Style, Fill, Stroke, Text, Circle } from 'ol/style';
import 'ol/ol.css';
const pack = window.ESTATE_PACK,
  data = pack.snapshot,
  format = new GeoJSON();
const read = g =>
  format.readFeatures(g, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  });
const options = (id, rows) => {
  const el = document.getElementById(id);
  for (const [value, text] of rows) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    el.appendChild(o);
  }
  return el;
};
const estate = options(
  'estate',
  data.estates.map(e => [e.id, e.name]),
);
const date = document.getElementById('date'),
  kind = document.getElementById('kind'),
  activity = document.getElementById('activity');
const dates = [
  ...new Set(
    [
      ...data.assets.map(a => a.acquiredAt),
      ...data.activities.map(r => r.date),
    ].filter(Boolean),
  ),
].sort();
date.value = dates.at(-1) || new Date().toISOString().slice(0, 10);
const map = new Map({
  target: 'map',
  view: new View({ center: fromLonLat([102, 4]), zoom: 6 }),
});
let fitted = '',
  vectors;
function render() {
  map.getLayers().clear();
  const e = data.estates.find(e => e.id === estate.value);
  if (!e) return;
  const featureList = read(
    e.boundary || { type: 'FeatureCollection', features: [] },
  );
  vectors = new VectorSource({ features: featureList });
  const candidates = data.assets.filter(
    a =>
      a.estateId === e.id &&
      a.kind === (kind.value === 'satellite' ? 'imagery' : kind.value),
  );
  const image =
    kind.value === 'satellite'
      ? candidates
          .filter(a => a.acquiredAt <= date.value)
          .sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt))[0]
      : candidates[0];
  if (image) {
    const b = image.bounds;
    map.addLayer(
      new ImageLayer({
        source: new ImageStatic({
          url: image.localFile,
          imageExtent: transformExtent(
            [b[0][1], b[0][0], b[1][1], b[1][0]],
            'EPSG:4326',
            'EPSG:3857',
          ),
          projection: 'EPSG:3857',
        }),
      }),
    );
  }
  map.addLayer(
    new VectorLayer({
      source: vectors,
      style: f =>
        new Style({
          stroke: new Stroke({ color: '#e4c75f', width: 1.5 }),
          text: new Text({
            text: f.get('blockName'),
            font: '11px sans-serif',
            fill: new Fill({ color: '#183d2b' }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
          }),
        }),
    }),
  );
  if (fitted !== e.id && featureList.length) {
    map
      .getView()
      .fit(vectors.getExtent(), { padding: [25, 25, 25, 25], maxZoom: 17 });
    fitted = e.id;
  }
  const rows = data.activities.filter(
    r =>
      r.estateId === e.id &&
      r.date === date.value &&
      (activity.value === 'all' || r.type === activity.value),
  );
  const markers = rows.flatMap(r => {
    const f = featureList.find(f => f.get('blockName') === r.block);
    if (!f) return [];
    const g = f.getGeometry();
    const point =
      g.getType() === 'Polygon'
        ? g.getInteriorPoint().getCoordinates()
        : g.getInteriorPoints().getCoordinates()[0];
    const m = new Feature({ geometry: new Point(point), record: r });
    return [m];
  });
  map.addLayer(
    new VectorLayer({
      source: new VectorSource({ features: markers }),
      style: f => {
        const t = f.get('record').type;
        return new Style({
          image: new Circle({
            radius: 13,
            fill: new Fill({
              color:
                t === 'Harvesting'
                  ? '#e9b741'
                  : t === 'Weeding'
                  ? '#78b7a6'
                  : '#dc8c69',
            }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
          }),
          text: new Text({
            text: t === 'Harvesting' ? '✦' : t === 'Weeding' ? '⌁' : '↝',
            fill: new Fill({ color: '#173e2c' }),
          }),
        });
      },
    }),
  );
  if (kind.value !== 'satellite') {
    for (const a of data.assets.filter(
      a => a.estateId === e.id && a.kind === 'contours' && a.json,
    )) {
      map.addLayer(
        new VectorLayer({
          source: new VectorSource({ features: read(a.json) }),
          style: new Style({
            stroke: new Stroke({ color: '#8b6c3988', width: 1 }),
          }),
        }),
      );
    }
  }
  document.getElementById('caption').textContent = image
    ? image.name + ' · saved offline'
    : 'No saved map for this date';
  document.getElementById('detail').textContent =
    rows.length + ' activities on ' + date.value;
  const timeline = document.getElementById('timeline');
  timeline.replaceChildren();
  for (const d of dates.filter(
    d =>
      data.assets.some(a => a.estateId === e.id && a.acquiredAt === d) ||
      data.activities.some(
        r =>
          r.estateId === e.id &&
          r.date === d &&
          (activity.value === 'all' || r.type === activity.value),
      ),
  )) {
    const button = document.createElement('button');
    const symbols = data.assets.some(
      a => a.estateId === e.id && a.acquiredAt === d,
    )
      ? '▧ '
      : '';
    const count = data.activities.filter(
      r =>
        r.estateId === e.id &&
        r.date === d &&
        (activity.value === 'all' || r.type === activity.value),
    ).length;
    button.textContent =
      symbols + d + (count ? ' · ' + count + ' activities' : '');
    button.className = d === date.value ? 'active' : '';
    button.onclick = () => {
      date.value = d;
      render();
    };
    timeline.appendChild(button);
  }
}
for (const control of [estate, date, kind, activity]) control.onchange = render;
map.on('singleclick', e => {
  const r = map.forEachFeatureAtPixel(e.pixel, f => f.get('record'));
  if (r)
    document.getElementById(
      'detail',
    ).textContent = `${r.type} · ${r.block} · ${r.quantity} · ${r.status}`;
});
render();
