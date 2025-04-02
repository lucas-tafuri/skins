const callback = () => {
  // Get config from the dashboard settings
  const { cMain, cSec, cRed } = COLORS;
  const { rpmM, redline, icon } = DASH_OPTIONS;
  const redlineValue = Number(redline) || 7000;  // Ensure redline is a number
  
  // Define constants
  const MAX_RPM = 8000;
  const MIN_RPM = 2000;
  const MAX_SPEED = 300;
  
  // Update simulation variables for gear transmission
  const gearRatios = [3.8, 2.2, 1.5, 1.1, 0.9]; // Editable gear ratios
  const gearSpeedLimits = [60, 120, 180, 240, 300]; // Updated limits for simulation (KM/H)
  let currentGear = 0; // starting at gear 1 (index 0)
  let simulatedSpeed = 0; // KM/H
  let simulatedOdo = 0;   // Odometer (KM)
  let accelerating = true; // New flag for rising/falling speed
  const gearUpRPM = 7000;
  const gearDownRPM = 3000;
  const acceleration = 0.1; // Speed increment per frame (KM/H)
  const odoIncrementFactor = 0.001; // Factor to adjust odometer increment

  // Add redline hold simulation variables
  let prevTime = performance.now();
  const redlineHoldDuration = 1; // seconds (configurable)
  let redlineHoldRemaining = 0;
  let holdingAtRedline = false;
  
  // Get DOM elements
  const elements = [
    'container', 'speedo', 'rpm', 'kmTotal', 
    'highBeam', 'parkLights', 'fogLights', 'hazardLights', 'position-indicator',
    // Add new gauge elements
    'water-temp-gauge', 'oil-temp-gauge', 'oil-press-gauge', 'battery-gauge', 'boost-gauge',
    'water-temp-fill', 'oil-temp-fill', 'oil-press-fill', 'battery-fill', 'boost-fill'
  ].reduce((acc, id) => ({ ...acc, [id.replace('-', '')]: document.getElementById(id) }), {});
  
  const { container, speedo, rpm, kmTotal, highBeam, parkLights, fogLights, hazardLights, positionindicator,
         watertempgauge, oiltempgauge, oilpressgauge, batterygauge, boostgauge,
         watertempfill, oiltempfill, oilpressfill, batteryfill, boostfill } = elements;
  
  // Set custom properties from dashboard settings
  setRootCSS('--grid-color', 'green');           // changed grid color
  setRootCSS('--grid-number-color', 'green');      // new property for grid numbers
  setRootCSS('--grid-dot-color', 'green');         // new property for grid dot
  setRootCSS('--grid-border-color', 'green');      // new property for grid borders
  setRootCSS('--grid-horizontal-lines', '10');     // new property to add more horizontal lines
  setRootCSS('--rpm-color', cSec);
  setRootCSS('--indicator-color', cRed);
  setRootCSS('--indicator-glow', `rgba(${hexToRgb(cRed)}, 0.4)`);
  
  // Initialize the odometer values (removed kmTrip reference)
  loadOdo(kmTotal, 0);
  
  // Helper function to convert hex to rgb for CSS variables
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
      `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
      '255, 153, 0';
  }
  
  // Update position indicator based on RPM and speed
  const updatePositionIndicator = (rpmValue, speedValue) => {
    // Calculate position percentages
    const rpmPercent = 100 - ((rpmValue - MIN_RPM) / (MAX_RPM - MIN_RPM) * 100);
    const speedPercent = (speedValue / MAX_SPEED) * 100;
    
    // Clamp values between 0 and 100
    const clampedRpmPercent = Math.min(Math.max(rpmPercent, 0), 100);
    const clampedSpeedPercent = Math.min(Math.max(speedPercent, 0), 100);
    
    // Update position
    positionindicator.style.top = `${clampedRpmPercent}%`;
    positionindicator.style.left = `${clampedSpeedPercent}%`;
    
    // Change indicator size based on speed (faster = slightly larger)
    const scale = 1 + (speedValue / MAX_SPEED) * 0.5;
    positionindicator.style.transform = `translate(-50%, -50%) scale(${scale})`;
    
    // Change indicator brightness based on RPM (higher RPM = brighter)
    const brightness = 0.6 + (rpmValue / MAX_RPM) * 0.4;
    positionindicator.style.opacity = brightness.toString();
    
    // Update grid numbers styling based on current position
    updateGridNumbersStyles(rpmValue, speedValue);
    
    // Update global glow based on RPM
    updateGlobalGlow(rpmValue);
  };
  
  // New function to update grid numbers styling
  function updateGridNumbersStyles(rpmValue, speedValue) {
    // Update speed (vertical) grid numbers for both top and bottom axis
    const speedTicks = document.querySelectorAll('#top-axis .tick span, #bottom-axis .tick span');
    speedTicks.forEach(tick => {
      const tickValue = parseInt(tick.textContent);
      // Apply appropriate class based on current speed
      if (speedValue >= tickValue + 15) {
        // Bright glow for numbers passed a while ago
        tick.classList.add('passed-bright');
        tick.classList.remove('passed');
      } else if (speedValue >= tickValue) {
        // Normal glow for numbers just passed
        tick.classList.add('passed');
        tick.classList.remove('passed-bright');
      } else {
        // Reset for numbers not yet passed
        tick.classList.remove('passed', 'passed-bright');
      }
    });
    
    // Update RPM (horizontal) grid numbers - fixed logic
    const rpmTicks = document.querySelectorAll('#left-axis .tick span');
    rpmTicks.forEach(tick => {
      const tickValue = parseInt(tick.textContent) * 1000; // Convert displayed RPM to actual RPM
      
      // Correct logic: RPM values are displayed from high (top) to low (bottom)
      if (rpmValue > tickValue) {
        // Current RPM is higher than this tick value - it's "passed" in the downward direction
        tick.classList.add('passed-bright');
        tick.classList.remove('passed');
      } else if (rpmValue > tickValue - 1000) {
        // Current RPM is just below this tick value
        tick.classList.add('passed');
        tick.classList.remove('passed-bright');
      } else {
        // Current RPM is well below this tick value
        tick.classList.remove('passed', 'passed-bright');
      }
    });
  }
  
  // Function to update the global glow
  function updateGlobalGlow(rpm) {
    // Calculate glow intensity based on RPM (0-15px)
    const intensity = (rpm / MAX_RPM) * 15;
    const alpha = 0.3 + (rpm / MAX_RPM) * 0.4; // 0.3 to 0.7
    
    // Create the glow value
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    const glowValue = `0 0 ${intensity}px rgba(${hexToRgbValues(primaryColor)}, ${alpha})`;
    
    // Set the CSS variable
    document.documentElement.style.setProperty('--global-glow', glowValue);
  }
  
  // Helper function to convert any RGB format to R,G,B values
  function hexToRgbValues(color) {
    // Handle hex colors
    if (color.startsWith('#')) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
      if (result) {
        return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
      }
    }
    
    // Handle rgb/rgba colors
    if (color.startsWith('rgb')) {
      // Extract just the r,g,b values without alpha
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (match) {
        return `${match[1]}, ${match[2]}, ${match[3]}`;
      }
    }
    
    // Fallback
    return '126, 133, 55';
  }
  
  // Update RPM display
  const updateRPM = (value) => {
    const rpmVal = Math.min(Math.max(value || 0, 0), MAX_RPM);
    const rpmText = String(Math.round(rpmVal)).padStart(4, '0'); // Pad with zeros to 4 digits
    setText(rpm, rpmText);
    
    // Highlight RPM text if approaching redline
    if (rpmVal > redlineValue) {  // use redlineValue
      rpm.style.color = cRed;
      rpm.style.textShadow = `0 0 10px ${cRed}`;
    } else {
      rpm.style.color = cSec;
      rpm.style.textShadow = 'none';
    }
    
    // Update RPM glow
    updateRpmGlow(rpmVal);
    
    return rpmVal;
  };
  
  // Update speed display
  const updateSpeed = (value) => {
    const speedVal = Math.min(Math.max(value || 0), MAX_SPEED);
    const speedText = String(Math.round(speedVal)).padStart(3, '0'); // Pad with zeros to 3 digits
    setText(speedo, speedText);
    return speedVal;
  };
  
  // Simulate gauge values
  function simulateGauges(engineRpm, vehicleSpeed) {
    // Water temperature (varies from 75°C to 105°C based on RPM and speed)
    const waterTemp = 75 + (engineRpm / MAX_RPM) * 25 + (vehicleSpeed / MAX_SPEED) * 5;
    const waterTempPercent = (waterTemp - 50) / (120 - 50) * 100; // 50°C to 120°C range
    if (watertempgauge) {
      watertempgauge.querySelector('.gauge-value').textContent = `${Math.round(waterTemp)}°C`;
      watertempfill.style.width = `${Math.min(Math.max(waterTempPercent, 0), 100)}%`;
    }
    
    // Oil temperature (varies from 70°C to 110°C, lags behind water temp)
    const oilTemp = 70 + (engineRpm / MAX_RPM) * 30 + (vehicleSpeed / MAX_SPEED) * 10;
    const oilTempPercent = (oilTemp - 40) / (130 - 40) * 100; // 40°C to 130°C range
    if (oiltempgauge) {
      oiltempgauge.querySelector('.gauge-value').textContent = `${Math.round(oilTemp)}°C`;
      oiltempfill.style.width = `${Math.min(Math.max(oilTempPercent, 0), 100)}%`;
    }
    
    // Oil pressure (varies from 1 to 5 BAR based on RPM)
    const oilPress = 1 + (engineRpm / MAX_RPM) * 4;
    const oilPressPercent = (oilPress - 0) / (6 - 0) * 100; // 0 to 6 BAR range
    if (oilpressgauge) {
      oilpressgauge.querySelector('.gauge-value').textContent = `${oilPress.toFixed(1)} BAR`;
      oilpressfill.style.width = `${Math.min(Math.max(oilPressPercent, 0), 100)}%`;
    }
    
    // Battery voltage (varies from 11.8V to 14.2V based on RPM)
    const battery = 11.8 + (engineRpm > 1000 ? 2.0 : engineRpm / 1000 * 2.0);
    const batteryPercent = (battery - 10) / (16 - 10) * 100; // 10V to 16V range
    if (batterygauge) {
      batterygauge.querySelector('.gauge-value').textContent = `${battery.toFixed(1)}V`;
      batteryfill.style.width = `${Math.min(Math.max(batteryPercent, 0), 100)}%`;
    }
    
    // Boost pressure (varies from 0 to 2 BAR based on RPM)
    const boost = Math.max(0, (engineRpm - 2000) / (MAX_RPM - 2000) * 2.0);
    const boostPercent = (boost - 0) / (2.5 - 0) * 100; // 0 to 2.5 BAR range
    if (boostgauge) {
      boostgauge.querySelector('.gauge-value').textContent = `${boost.toFixed(1)} BAR`;
      boostfill.style.width = `${Math.min(Math.max(boostPercent, 0), 100)}%`;
    }
  }

  // Function to update dashboard data
  const bindRealtimeData = () => {
    const currentTime = performance.now();
    const dt = (currentTime - prevTime) / 1000;
    prevTime = currentTime;

    let simulatedRpm; // declare for use later

    if (accelerating) {
      // Normal acceleration update for non-redline region
      simulatedSpeed = Math.min(simulatedSpeed + acceleration, MAX_SPEED);
        
      // Check if we've reached MAX_SPEED, toggle to deceleration
      if (simulatedSpeed >= MAX_SPEED * 0.99) {
        accelerating = false;
      }
        
      simulatedRpm = (simulatedSpeed / gearSpeedLimits[currentGear]) * MAX_RPM;
      simulatedRpm = Math.min(simulatedRpm, MAX_RPM);
      // Enter redline hold when RPM exceeds gearUpRPM
      if (simulatedRpm > gearUpRPM && currentGear < gearRatios.length - 1) {
        currentGear++;
        // Less dramatic speed drop during gear change
        simulatedSpeed = simulatedSpeed * 0.98;
        simulatedRpm = (simulatedSpeed / gearSpeedLimits[currentGear]) * MAX_RPM;
      }
    } else {
      // Deceleration branch
      simulatedSpeed = Math.max(simulatedSpeed - acceleration, 0);
      
      // If we've reached zero speed, toggle back to acceleration
      if (simulatedSpeed <= 0) {
        accelerating = true;
        currentGear = 0; // Reset to first gear
      }
      
      simulatedRpm = (simulatedSpeed / gearSpeedLimits[currentGear]) * MAX_RPM;
      simulatedRpm = Math.min(simulatedRpm, MAX_RPM);
      
      // Enhanced gear down shifting during deceleration with RPM matching
      if (simulatedRpm < gearDownRPM && currentGear > 0) {
        currentGear--;
        // When downshifting, RPM increases as we're now in a lower gear
        simulatedRpm = (simulatedSpeed / gearSpeedLimits[currentGear]) * MAX_RPM;
      }
    }
    
    // Update displays using simulated values
    const currentRpm = updateRPM(simulatedRpm);
    const currentSpeed = updateSpeed(simulatedSpeed);
    
    // Update odometer simulation
    simulatedOdo += simulatedSpeed * odoIncrementFactor;
    updateOdo(kmTotal, simulatedOdo);
    
    // Update position indicator with simulated values
    updatePositionIndicator(currentRpm, currentSpeed);
    
    // Simulate light states based on speed and time
    simulateLightStates(currentSpeed);
    
    // Simulate gauge values
    simulateGauges(currentRpm, currentSpeed);
    
    requestAnimationFrame(bindRealtimeData);
  };

  // Simulate light states
  function simulateLightStates(speed) {
    // Get time in seconds
    const timeInSeconds = performance.now() / 1000;
    
    // Low beam - on when speed > 0
    parkLights.parentElement.classList.toggle('active', speed > 0);
    
    // High beam - toggle every 10 seconds
    highBeam.parentElement.classList.toggle('active', Math.floor(timeInSeconds / 10) % 2 === 0);
    
    // Fog lights - toggle every 15 seconds
    fogLights.parentElement.classList.toggle('active', Math.floor(timeInSeconds / 15) % 2 === 0);
    
    // Hazard lights - blinking - toggle every 0.5 seconds
    hazardLights.parentElement.classList.toggle('active', Math.floor(timeInSeconds * 2) % 2 === 0);
  }

  // Replace icons with colored ones if specified in settings
  if (icon !== 1) {
    const icons = document.querySelectorAll('img');
    icons.forEach(img => {
      img.src = img.src.replace('icons', 'icons_color');
    });
  }
  
  // Open connection to the dashboard hardware
  setTimeout(() => openConnection(bindRealtimeData), 500);
  
  // Trigger animation when DOM is ready
  container.classList.add('anim-in');
};

// Function to update the RPM glow
function updateRpmGlow(rpm) {
  const positionIndicator = document.getElementById('position-indicator');
  positionIndicator.classList.remove('rpm-low', 'rpm-medium', 'rpm-high');

  if (rpm < 3000) {
    positionIndicator.classList.add('rpm-low');
  } else if (rpm < 6000) {
    positionIndicator.classList.add('rpm-medium');
  } else {
    positionIndicator.classList.add('rpm-high');
  }
}

// Set callback to run when window loads
window.onload = callback;
