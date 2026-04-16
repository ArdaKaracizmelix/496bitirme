import React from 'react';

export default function MapViewport({ html }) {
  return (
    <iframe
      srcDoc={html}
      style={{ width: '100%', height: '100%', border: 'none' }}
      title="excursa-map"
    />
  );
}
