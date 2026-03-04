import { Color, MeshLambertMaterial, DoubleSide } from 'three';

const markerImgs = [
  "https://uploads-ssl.webflow.com/5f89ad61c0ef675e5948350e/667c21b9fd8862143cbefa36_marker_1.png",
  "https://uploads-ssl.webflow.com/5f89ad61c0ef675e5948350e/667c21b974352812b5d54904_marker_2.png",
  //"https://uploads-ssl.webflow.com/5f89ad61c0ef675e5948350e/667c21b9116853eb6038fa10_marker_4.png",
  "https://uploads-ssl.webflow.com/5f89ad61c0ef675e5948350e/667c21b9aa413cca21c4dd10_marker_3.png",
  "https://uploads-ssl.webflow.com/5f89ad61c0ef675e5948350e/667c23f6c2c62c093707a3bd_marker_5.png",
  "https://uploads-ssl.webflow.com/5f89ad61c0ef675e5948350e/667c28d3dd6693e507236c5c_marker_6.png"
];

const markers = markerImgs.map(imageUrl => `<img src=${imageUrl} width="33" />`);

const cloudImgs = [
  "https://uploads-ssl.webflow.com/5f89ad61c0ef675e5948350e/667c32a4aee270c4aa5530b9_cloud.png"
]

const clouds = cloudImgs.map(imageUrl => `<img src=${imageUrl} style="width: 100%;" />`);

export class GlobeVisualizer {
  constructor(containerId) {
    this.containerId = containerId;
    this.arcsData = [];
    this.gData = [];
    this.world = null;
    this.resetViewTimeout = null;

    this.initialize();
  }

  initialize() {
    this.generateData();
    this.createWorld();
    this.loadLandData();
    this.addResetViewListener();
    window.addEventListener('resize', this.onWindowResize.bind(this));
    this.onWindowResize(); // Initial resize to set the correct size
  }

  getRandomLatLng() {
    const u = Math.random();
    const v = Math.random();
    const lat = Math.acos(2 * u - 1) / Math.PI * 180 - 90;
    const lng = 360 * v - 180;
    return { lat, lng };
  }

  getRandomLocation(region) {
    let lat, lng;
    if (region === 'US') {
      lat = (Math.random() * (49 - 25) + 25);
      lng = -(Math.random() * (125 - 67) + 67);
    } else if (region === 'Europe') {
      lat = (Math.random() * (71 - 35) + 35);
      lng = (Math.random() * (40 - -10) + -10);
    } else if (region === 'Italy') {
      lat = (Math.random() * (47 - 35) + 35);
      lng = (Math.random() * (18 - 6) + 6);
    } else if (region === 'UK') {
      lat = (Math.random() * (59 - 50) + 50);
      lng = (Math.random() * (2 - -7) + -7);
    } else if (region === 'Africa') {
      const africanTargets = [
        { lat: 9.082, lng: 8.6753 }, // Nigeria
        { lat: 7.9465, lng: -1.0232 }, // Ghana
        { lat: -1.2921, lng: 36.8219 }, // Kenya
        { lat: 3.848, lng: 11.5021 }, // Cameroon
        { lat: -30.5595, lng: 22.9375 }, // South Africa
        { lat: 1.3733, lng: 32.2903 }, // Uganda
        { lat: -1.9403, lng: 29.8739 } // Rwanda
      ];
      const target = africanTargets[Math.floor(Math.random() * africanTargets.length)];
      lat = target.lat;
      lng = target.lng;
    }
    return { lat, lng };
  }

  generateData() {
    const targets = [
      { lat: 9.082, lng: 8.6753 }, // Nigeria
      { lat: 7.9465, lng: -1.0232 }, // Ghana
      { lat: -1.2921, lng: 36.8219 }, // Kenya
      { lat: 3.848, lng: 11.5021 }, // Cameroon
      { lat: -30.5595, lng: 22.9375 }, // South Africa
      { lat: 1.3733, lng: 32.2903 }, // Uganda
      { lat: -1.9403, lng: 29.8739 } // Rwanda
    ];

    const europeanTargets = [
      { lat: 50.1109, lng: 8.6821 }, // Frankfurt, Germany
      { lat: 48.8566, lng: 2.3522 }, // Paris, France
      { lat: 51.5074, lng: -0.1278 }, // London, UK
      { lat: 41.9028, lng: 12.4964 } // Rome, Italy
    ];

    const regions = ['US', 'Europe', 'Italy', 'UK', 'Africa'];
    const targetIndices = {
      'US': [5, 6], // Uganda, Rwanda
      'Europe': [0, 1, 2, 3],
      'Italy': [4], // South Africa
      'UK': [4], // South Africa
      'Africa': [0, 1, 2, 3] // European targets
    };

    // Generate arcs ending in Europe
    for (let i = 0; i < 3; i++) {
      const start = this.getRandomLocation('Africa');
      const end = europeanTargets[Math.floor(Math.random() * europeanTargets.length)];
      const duration = Math.random() * 3000 + 2000;

      this.arcsData.push({
        startLat: start.lat,
        startLng: start.lng,
        endLat: end.lat,
        endLng: end.lng,
        duration: duration,
        color: ['#00A2DC', '#FFF']
      });
    }

    // Generate other arcs
    regions.forEach(region => {
      const numLines = region === 'US' ? 2 : (region === 'Italy' || region === 'UK') ? 1 : 1;
      for (let i = 0; i < numLines; i++) {
        const start = this.getRandomLocation(region);
        const endRegion = region === 'Africa' ? 'Europe' : region;
        const endTargets = endRegion === 'Africa' ? europeanTargets : targets;
        const end = endTargets[targetIndices[region][Math.floor(Math.random() * targetIndices[region].length)]];
        const duration = Math.random() * 3000 + 2000;

        this.arcsData.push({
          startLat: start.lat,
          startLng: start.lng,
          endLat: end.lat,
          endLng: end.lng,
          duration: duration,
          color: ['#00A2DC', '#FFF']
        });
      }
    });
    
    markers.forEach((marker, i) => {
      this.gData.push({
        marker,
        lat: this.arcsData[i+2].endLat,
        lng: this.arcsData[i+2].endLng,
        size: 32
      })
    })
  }

  createWorld() {
    this.world = Globe()
      .htmlElementsData(this.gData)
      .htmlElement(d => {
        const el = document.createElement('div');
        el.innerHTML = d.marker;
        el.style.width = `${d.size}px`;
        return el;
      })
      (document.getElementById(this.containerId))
      .pointOfView({ lat: -8, lng: 24, altitude: 2 })
      .backgroundColor('#023C8B00')
      .showGlobe(true)
      .showAtmosphere(true)
      .arcsData(this.arcsData)
      .arcColor('color')
      .arcStroke(0.3)
      .arcDashLength(1)
      .arcDashGap(1)
      .arcDashAnimateTime(d => d.duration)
      .arcAltitude(0.2);

    this.world.controls().enableZoom = false;

    this.world.globeMaterial().emissive.set('#023C8B');
  }

  loadLandData() {
    fetch('//unpkg.com/world-atlas@2.0.2/land-110m.json').then(res => res.json())
      .then(landTopo => {
        this.world
          .polygonsData(topojson.feature(landTopo, landTopo.objects.land).features)
          .polygonCapMaterial(new MeshLambertMaterial({ color: '#0662B9', side: DoubleSide }))
          .polygonSideColor(() => '#023C8B')
          .polygonAltitude(0.008);
      });
  }

  addResetViewListener() {
    this.world.controls().addEventListener('change', () => {
      if (this.resetViewTimeout) {
        clearTimeout(this.resetViewTimeout);
      }
      this.resetViewTimeout = setTimeout(() => {
        this.world.pointOfView({ lat: -8, lng: 24 }, 1000);
      }, 200);
    });
  }

  onWindowResize() {
    const container = document.getElementById(this.containerId);
    if (container) {
      const { width, height } = container.getBoundingClientRect();
      this.world.width([width]);
      this.world.height([height]);
    }
  }
}