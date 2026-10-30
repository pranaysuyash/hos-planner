import { ShipmentWorkspace } from './suite/ShipmentWorkspace';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ShipmentWorkspace productId="product-03-hos-planner"><App /></ShipmentWorkspace>
  </React.StrictMode>
);
