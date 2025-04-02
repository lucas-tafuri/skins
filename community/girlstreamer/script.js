const callback = () => {
  // Variables, constants and DOM elements
  const signals = [
    'turnLeft', 'turnRight', 'battAlt', 'eBrake', 'highBeam', 'parkLights',
    'fogLights', 'auxLights', 'openDoor', 'fan', 'oilSwitch', 'ECUErr'
  ];
  const elems = [
    ...signals, 'container', 'speedo', 'rpm', 'kmTrip', 'kmTotal', 'fuelLevel',
    'battLevel', 'fuelPressure', 'lambda', 'oilPressure', 'mapBoost', 'cltNow',
    'fuelBar', 'clt-bar', 'rpm-sprite'
  ].reduce((acc, id) => ({ ...acc, [id]: document.getElementById(id) }), {});
  
  const {
    container, speedo, rpm, kmTrip, kmTotal, battLevel, fuelBar,
    fuelPressure, lambda, oilPressure, mapBoost, fuelLevel, cltNow
  } = elems;
  const cltBar = document.getElementById('clt-bar');
  const rpmSprite = document.getElementById('rpm-sprite');
  const animationContainer = document.querySelector('.animation-container');
  
  // Animation frame configuration
  const TOTAL_FRAMES = 93; // Updated from 23 to 93 frames in the sprite sheet
  const SPRITE_WIDTH = 42780; // Updated from 11270 to 42780px wide
  const FRAME_WIDTH = SPRITE_WIDTH / TOTAL_FRAMES; // Width of each frame
  
  // Animation ranges configuration - adjusted for more frames
  const LOW_RPM_RANGE = { min: 0, max: 2000, frames: { start: 0, end: 25 } }; // Expanded from 0-6 to 0-25
  const MID_RPM_RANGE = { min: 2000, max: 4500 };
  const HIGH_RPM_RANGE = { min: 4500, max: 6000, frames: { start: 45, end: 92 } }; // Expanded from 10-22 to 45-92
  
  // Animation timing variables
  let animationStartTime = Date.now();
  let pingPongDuration = 1000; // Duration in ms for one complete ping-pong cycle
  
  const { cMain, cSec, cRed } = COLORS;
  const { aSpd, redline, icon, kmTotal: kmTotalSetting, tClt, rpmM } = DASH_OPTIONS;
  const maxRPM = rpmM * 1000;
  const maxSpeed = 300;
  const maxTemp = tClt;
  let [useCAN, useCANForRPM, useCANForVSS, useCANForCLT] = [false, false, false, false];
  
  // Set colors from settings
  setRootCSS('--main-color', cMain);
  setRootCSS('--secondary-color', cSec);
  setRootCSS('--red-color', cRed);
  
  // Load odometer with initial value - fix to prevent errors
  if (kmTrip && kmTotal) {
    loadOdo(kmTotal, 0);
  }
  
  // Add simulation variables for slower, more realistic RPM cycling
  const SIMULATION_ENABLED = true; // Set to true to enable simulation mode
  const RPM_MIN = 0;
  const RPM_MAX = maxRPM; // Using the maxRPM from settings
  const IDLE_RPM = 800; // Realistic idle RPM
  let simulationStartTime = Date.now();
  let simulatedRPM = IDLE_RPM;
  let simulatedSpeed = 0;
  let simulationPaused = false;
  let pauseTimeout = null;
  
  // Gear simulation variables with more realistic parameters
  const gearRatios = [3.8, 2.2, 1.5, 1.1, 0.9]; // Transmission ratios
  const gearSpeedLimits = [60, 110, 160, 210, 300]; // Speed limits per gear (KM/H) - Top speed is 300 km/h
  const gearUpRPM = redline * 0.80; // Upshift at 80% of redline to prevent revving too high
  const gearDownRPM = 1800; // Downshift at low RPM
  let currentGear = 0; // Start in first gear
  let accelerating = true; // Whether we're accelerating or decelerating
  let gearChangeTime = 0; // Time of last gear change for animation
  let inGearChange = false; // Flag for gear change animation
  const GEAR_CHANGE_DURATION = 800; // Longer for more realistic shifts
  let clutchEngaged = false; // Simulate clutch engagement during gear changes
  
  // Even slower acceleration/deceleration for more realism
  const ACCELERATION_RATE = 0.15; // KM/H per frame (reduced from 0.3)
  const DECELERATION_RATE = 0.25; // KM/H per frame (reduced from 0.4)
  
  // Add simulation cycle controls for more realistic driving patterns
  const SIMULATION_CYCLE = {
    accelerateToTopSpeed: true,  // Whether to accelerate to max speed or use a more realistic pattern
    pauseAtTopSpeed: 4000,       // Milliseconds to pause at top speed
    pauseAtIdle: 2000,           // Milliseconds to pause at idle before starting again
    cruiseSpeed: 120,            // Target cruise speed in KM/H
    cruiseDuration: 8000,        // Duration to maintain cruise speed
    useCruise: true              // Whether to use cruise mode
  };
  
  // Function to simulate RPM values with gear changes
  const simulateRPM = () => {
    const currentTime = Date.now();
    
    // Handle paused state for more realistic driving patterns
    if (simulationPaused) {
      if (currentTime >= pauseTimeout) {
        simulationPaused = false;
      } else {
        return Math.round(simulatedRPM); // Keep current values while paused
      }
    }
    
    // Handle acceleration/deceleration cycle with more realistic behavior
    if (accelerating) {
      // Only accelerate if we're not in the middle of a gear change
      if (!clutchEngaged) {
        // Even slower acceleration for better realism
        simulatedSpeed = Math.min(simulatedSpeed + ACCELERATION_RATE, maxSpeed);
        
        // Implement cruise control behavior for realism
        if (SIMULATION_CYCLE.useCruise && 
            simulatedSpeed >= SIMULATION_CYCLE.cruiseSpeed && 
            currentGear >= 3) {
          // Reached cruise speed, maintain it for a while
          simulatedSpeed = SIMULATION_CYCLE.cruiseSpeed;
          
          // Occasionally pause at cruise speed
          if (Math.random() < 0.005) { // 0.5% chance per frame
            simulationPaused = true;
            pauseTimeout = currentTime + SIMULATION_CYCLE.cruiseDuration;
            console.log("Cruising at", simulatedSpeed, "KM/H");
          }
        }
      }
      
      // Check for max speed reached
      if (simulatedSpeed >= (SIMULATION_CYCLE.accelerateToTopSpeed ? maxSpeed * 0.98 : SIMULATION_CYCLE.cruiseSpeed * 1.1)) {
        // Reached target speed, pause briefly before decelerating
        simulationPaused = true;
        pauseTimeout = currentTime + SIMULATION_CYCLE.pauseAtTopSpeed;
        accelerating = false;
      }
    } else {
      // Decelerate at a moderate rate when not in gear change
      if (!clutchEngaged) {
        simulatedSpeed = Math.max(simulatedSpeed - DECELERATION_RATE, 0);
        
        // Add slight variability to deceleration
        if (Math.random() < 0.1) { // 10% chance
          simulatedSpeed -= (Math.random() * 0.2); // Add a small extra deceleration
        }
      }
      
      // Check for min speed reached
      if (simulatedSpeed <= 1) {
        simulatedSpeed = 0;
        
        // Pause at idle before starting next cycle
        simulationPaused = true;
        pauseTimeout = currentTime + SIMULATION_CYCLE.pauseAtIdle;
        accelerating = true;
        currentGear = 0; // Reset to first gear
        simulatedRPM = IDLE_RPM; // Set to idle RPM
        return IDLE_RPM;
      }
    }
    
    // Calculate simulated RPM based on gear and speed - more realistic formula with slower RPM rise
    let targetRPM;
    
    if (simulatedSpeed < 1) {
      // At standstill, maintain idle RPM with slight variations
      targetRPM = IDLE_RPM + (Math.sin(currentTime / 1000) * 50);
    } else {
      // Moving: calculate RPM based on speed, gear ratio and wheel size (more realistic)
      const wheelRpm = simulatedSpeed / 3.6 / (0.32 * Math.PI) * 60; // wheel rpm based on speed and 32cm wheel radius
      
      // Use a slower RPM rise formula with modified final drive ratio (lower makes RPM rise slower)
      targetRPM = wheelRpm * gearRatios[currentGear] * 3.8; // Reduced final drive ratio from 4.1 to 3.8
      
      // Add slight variations for realism
      targetRPM += (Math.sin(currentTime / 500) * 50);
    }
    
    // Make sure minimum RPM is idle
    targetRPM = Math.max(targetRPM, IDLE_RPM);
    
    // Handle gear shifts with cooldown to prevent too-frequent shifts
    const minTimeBetweenShifts = 1500; // ms
    const shiftsAllowed = currentTime - gearChangeTime > minTimeBetweenShifts;
    
    if (accelerating && targetRPM > gearUpRPM && currentGear < gearRatios.length - 1 && !inGearChange && shiftsAllowed) {
      // Initiate upshift
      inGearChange = true;
      clutchEngaged = true;
      gearChangeTime = currentTime;
      
      // Schedule gear completion
      setTimeout(() => {
        currentGear++;
        console.log(`Upshifted to gear ${currentGear + 1}`);
        
        // Brief pause before re-engaging clutch
        setTimeout(() => {
          clutchEngaged = false;
        }, 300); // Longer clutch engagement time
      }, GEAR_CHANGE_DURATION * 0.6); // Change gear after clutch & RPM drop
      
    } else if (!accelerating && targetRPM < gearDownRPM && currentGear > 0 && !inGearChange && shiftsAllowed) {
      // Initiate downshift
      inGearChange = true;
      clutchEngaged = true;
      gearChangeTime = currentTime;
      
      // Schedule gear completion
      setTimeout(() => {
        currentGear--;
        console.log(`Downshifted to gear ${currentGear + 1}`);
        
        // Brief pause before re-engaging clutch
        setTimeout(() => {
          clutchEngaged = false;
        }, 200); // Slightly quicker on downshifts
      }, GEAR_CHANGE_DURATION * 0.4); // Change gear after clutch & RPM drop
    }
    
    // Apply gear change animation effect with more realistic RPM curves
    if (inGearChange) {
      const gearChangeProgress = Math.min((currentTime - gearChangeTime) / GEAR_CHANGE_DURATION, 1);
      
      if (accelerating) {
        // More realistic upshift RPM behavior:
        if (gearChangeProgress < 0.4) {
          // Stage 1: Quick RPM drop as clutch disengages
          const dropFactor = 1 - (gearChangeProgress / 0.4) * 0.7;
          simulatedRPM = targetRPM * dropFactor;
        } else if (gearChangeProgress < 0.7) {
          // Stage 2: RPM stabilizes at idle-ish
          simulatedRPM = IDLE_RPM + 200; // Just above idle during shift
        } else {
          // Stage 3: RPM rises as clutch reengages in new gear
          const riseProgress = (gearChangeProgress - 0.7) / 0.3;
          const newGearRPM = (simulatedSpeed / gearSpeedLimits[Math.min(currentGear + 1, gearRatios.length - 1)]) * RPM_MAX;
          simulatedRPM = (IDLE_RPM + 200) + (riseProgress * (newGearRPM - (IDLE_RPM + 200)));
        }
      } else {
        // Downshift behavior with rev-matching:
        if (gearChangeProgress < 0.3) {
          // Stage 1: RPM drops as clutch disengages
          const dropFactor = 1 - (gearChangeProgress / 0.3) * 0.6;
          simulatedRPM = targetRPM * dropFactor + IDLE_RPM * (1 - dropFactor);
        } else {
          // Stage 2: RPM rises as clutch engages in lower gear
          const riseProgress = (gearChangeProgress - 0.3) / 0.7;
          const newGearRPM = (simulatedSpeed / gearSpeedLimits[Math.max(currentGear - 1, 0)]) * RPM_MAX;
          simulatedRPM = (IDLE_RPM + 200) + (riseProgress * (newGearRPM - (IDLE_RPM + 200)));
          
          // Add a "blip" effect for rev-matching during downshifts
          if (riseProgress > 0.3 && riseProgress < 0.7) {
            const blipIntensity = Math.sin((riseProgress - 0.3) / 0.4 * Math.PI);
            simulatedRPM *= (1 + blipIntensity * 0.3);
          }
        }
      }
      
      // Reset gear change flag when animation is complete
      if (gearChangeProgress >= 1) {
        inGearChange = false;
      }
    } else {
      // Normal RPM tracking when not changing gears
      // Slower RPM adjustment towards target with more lag for realism
      simulatedRPM = simulatedRPM + (targetRPM - simulatedRPM) * 0.05; // Reduced from 0.1 for slower RPM changes
    }
    
    // Add some minor RPM fluctuations for realism when at speed
    if (simulatedSpeed > 5 && !inGearChange) {
      simulatedRPM += Math.sin(currentTime / 200) * (10 + (simulatedSpeed / 20));
    }
    
    // Ensure RPM stays within bounds
    simulatedRPM = Math.min(Math.max(simulatedRPM, IDLE_RPM), RPM_MAX);
    
    // Display current gear info in console (less frequently)
    if (Math.random() < 0.005) { // Reduced from 0.01 for less console spam
      console.log(`Gear: ${currentGear + 1}, Speed: ${simulatedSpeed.toFixed(1)}, RPM: ${simulatedRPM.toFixed(0)}, Shifting: ${inGearChange}`);
    }
    
    return Math.round(simulatedRPM);
  };
  
  // Function to get current gear for display
  const getCurrentGear = () => {
    if (simulatedSpeed < 1) return 'N'; // Neutral when stopped
    if (clutchEngaged) return inGearChange ? '•' : 'N'; // Show neutral or shifting dot when clutch engaged
    return (currentGear + 1).toString(); // Gears 1-5
  };
  
  // Control the sprite frame based on RPM ratio and RPM value
  const updateSpriteFrame = (rpmRatio, rpm) => {
    if (!rpmSprite) return; // Guard clause to prevent errors
    
    let frameIndex;
    const currentTime = Date.now();
    const elapsedTime = currentTime - animationStartTime;
    
    if (rpm < LOW_RPM_RANGE.max) {
      // Below 2000 RPM: Ping-pong between frames 1-25
      frameIndex = calculatePingPongFrame(
        elapsedTime, 
        LOW_RPM_RANGE.frames.start, 
        LOW_RPM_RANGE.frames.end, 
        pingPongDuration
      );
    } else if (rpm >= MID_RPM_RANGE.min && rpm < MID_RPM_RANGE.max) {
      // 2000-4500 RPM: Direct mapping based on RPM position in the range
      const rangeRatio = (rpm - MID_RPM_RANGE.min) / (MID_RPM_RANGE.max - MID_RPM_RANGE.min);
      const frameRange = HIGH_RPM_RANGE.frames.start - LOW_RPM_RANGE.frames.end - 1;
      frameIndex = LOW_RPM_RANGE.frames.end + 1 + Math.floor(rangeRatio * frameRange);
    } else if (rpm >= HIGH_RPM_RANGE.min) {
      // 4500+ RPM: Ping-pong between frames 45-92
      frameIndex = calculatePingPongFrame(
        elapsedTime, 
        HIGH_RPM_RANGE.frames.start, 
        HIGH_RPM_RANGE.frames.end, 
        pingPongDuration
      );
    } else {
      // Fallback: Direct RPM mapping
      frameIndex = Math.min(Math.floor(rpmRatio * TOTAL_FRAMES), TOTAL_FRAMES - 1);
    }
    
    // Set the background position for the calculated frame - fixed calculation
    if (rpmSprite) {
      const percentage = (frameIndex / (TOTAL_FRAMES - 1)) * 100;
      rpmSprite.style.backgroundPosition = `${percentage}% 0%`;
      console.log(`Setting sprite position to ${percentage}% for frame ${frameIndex}`);
    }
  };
  
  // Calculate frame for ping-pong animation
  const calculatePingPongFrame = (elapsedTime, startFrame, endFrame, duration) => {
    const frameCount = endFrame - startFrame + 1;
    const totalSteps = (frameCount - 1) * 2; // Complete back and forth
    
    // Calculate normalized position in the ping-pong cycle (0 to 1)
    const cyclePosition = (elapsedTime % duration) / duration;
    
    // Convert to position in ping-pong (0 to totalSteps)
    const pingPongPosition = cyclePosition * totalSteps;
    
    // Determine if we're in the forward or backward part of the cycle
    if (pingPongPosition < frameCount - 1) {
      // Forward: 0 -> frameCount-1
      return startFrame + Math.floor(pingPongPosition);
    } else {
      // Backward: frameCount-1 -> 0
      return endFrame - Math.floor(pingPongPosition - (frameCount - 1));
    }
  };
  
  // Wrapper method to update the RPM
  const updateRPM = (value) => {
    if (!rpm) return; // Guard clause to prevent errors
    
    // Ensure the value is visible for debugging
    console.log("Updating RPM:", value);
    
    // Set the text content directly
    if (rpm) rpm.textContent = zeroFixed(value);
    
    const rpmRatio = Math.min(+value / maxRPM, 1);
    setRootCSS('--rpm-progress', rpmRatio);
    
    // Change color if rpm is above redline
    const gaugeColor = +value < redline ? cMain : cRed;
    const rpmProgress = document.querySelector('.rpm-progress');
    if (rpmProgress) {
      rpmProgress.style.borderColor = gaugeColor;
    }
    
    // Update animation container based on RPM
    if (animationContainer) {
      if (+value >= redline) {
        animationContainer.classList.add('redline');
      } else {
        animationContainer.classList.remove('redline');
      }
    }
    
    // Control sprite frame based on RPM
    updateSpriteFrame(rpmRatio, +value);
  };
  
  // Wrapper method to update the speedometer
  const setKmhDeg = ([val, valf]) => {
    if (!speedo) return; // Guard clause to prevent errors
    
    // Ensure the value is visible for debugging
    console.log("Updating Speed:", val);
    
    // Set the text content directly
    if (speedo) speedo.textContent = zeroFixed(aSpd < 2 ? (valf || val) : val);
    
    const speedRatio = Math.min(val / maxSpeed, 1);
    setRootCSS('--kmh-progress', speedRatio);
  };
  
  // Update fuel level bar for vertical orientation
  const setFuelLevelBar = (value) => {
    if (!fuelBar) return; // Guard clause to prevent errors
    
    const fuelRatio = Math.min(Math.max(value / 100, 0), 1);
    setRootCSS('--fuel-level', `${fuelRatio * 100}%`);
  };
  
  // Update coolant temperature bar for vertical orientation
  const setCLTBar = (value) => {
    if (!cltBar) return; // Guard clause to prevent errors
    
    const cltRatio = Math.min(Math.max(value / maxTemp, 0), 1);
    setRootCSS('--clt-level', `${cltRatio * 100}%`);
    
    // Change color if temperature is above 80% of max
    if (cltRatio > 0.8) {
      cltBar.classList.add('red');
      if (document.querySelector('#clt-bar')) document.querySelector('#clt-bar').style.backgroundColor = 'var(--red-color)';
    } else {
      cltBar.classList.remove('red');
      if (document.querySelector('#clt-bar')) document.querySelector('#clt-bar').style.backgroundColor = '';
    }
  };

  // Check which data sources to use
  const checkSource = () => [useCAN, useCANForRPM, useCANForVSS, useCANForCLT] = [
    useCanChannel(),
    useCanChannel('sRpm'),
    useCanChannel('sVss'),
    useCanChannel('sClt'),
  ];
  
  // Format MAP to boost
  const mapFormat = (value) => {
    if (value == 0 || !value) return 0;
    const map = (+value - 101.3) / 100;
    return map.toFixed(1);
  };
  
  // Bind the realtime data to the DOM
  const bindRealtimeData = () => {
    // Check if the source has changed and update the cache
    try {
      if (!checkCache('useCAN', useCanChannel())) checkSource();
      
      // Use simulation mode or real data
      if (SIMULATION_ENABLED) {
        // Get simulated RPM and update display
        const rpm = simulateRPM();
        updateRPM(rpm);
        
        // Update speed based on simulated RPM
        setKmhDeg([simulatedSpeed]);
        
        // Update gear in donation display with better styling
        if (rpm) {
          const gearDisplay = document.getElementById('rpm');
          if (gearDisplay) {
            // Add gear indicator to the donation amount with improved styling
            const donationValue = Math.round(2000 + (simulatedRPM / RPM_MAX) * 8000);
            const currentGearStr = getCurrentGear();
            
            // Style gear indicator differently based on state
            let gearStyle = 'opacity:0.7;margin-left:5px';
            
            // Add visual indicator for gear changes
            if (inGearChange) {
              gearStyle = 'opacity:0.9;margin-left:5px;color:#ff9;text-shadow:0 0 3px #ff0';
            } else if (currentGearStr === 'N') {
              gearStyle = 'opacity:0.8;margin-left:5px;color:#9cf';
            }
            
            gearDisplay.innerHTML = `${donationValue}<span style="font-size:0.6em;${gearStyle}">(${currentGearStr})</span>`;
          }
        }
        
        // Simulate other values based on RPM
        if (fuelLevel) setText(fuelLevel, Math.round(50 + (Math.sin(Date.now() / 10000) * 20)));
        setFuelLevelBar(50 + (Math.sin(Date.now() / 10000) * 20));
        
        // Simulate temperature (60-110°C range based on RPM)
        const tempValue = 60 + (simulatedRPM / RPM_MAX) * 50;
        setCLTBar(tempValue);
        if (cltNow) setText(cltNow, Math.round(tempValue));
        
        // Simulate other gauge values
        if (battLevel) setText(battLevel, (12 + (simulatedRPM / RPM_MAX) * 2).toFixed(1));
        if (lambda) setText(lambda, (0.8 + (Math.sin(Date.now() / 3000) * 0.2)).toFixed(2));
        if (oilPressure) setText(oilPressure, (1 + (simulatedRPM / RPM_MAX) * 5).toFixed(1));
        if (mapBoost) setText(mapBoost, Math.max(0, ((simulatedRPM - 3000) / RPM_MAX) * 2).toFixed(1));
        if (fuelPressure) setText(fuelPressure, (3 + (simulatedRPM / RPM_MAX) * 2).toFixed(1));
        
        // Simulate trip and total odometers
        if (kmTrip && kmTotal) {
          const totalDistance = ((Date.now() - simulationStartTime) / 3600000) * 120; // 120 km/h average
          updateOdo(kmTotal, totalDistance);
        }
        
        // Animate indicators based on RPM
        for (let i = 0; i < signals.length; i++) {
          if (elems[signals[i]]) {
            // Activate turn signals alternately
            if (signals[i] === 'turnLeft' || signals[i] === 'turnRight') {
              const isActive = Math.floor(Date.now() / 500) % 2 === 0;
              etoggle(elems[signals[i]], signals[i] === 'turnLeft' ? isActive : !isActive);
            }
            // Light up oil and ECU warnings at high RPM
            else if (signals[i] === 'oilSwitch' || signals[i] === 'ECUErr') {
              etoggle(elems[signals[i]], simulatedRPM > RPM_MAX * 0.85);
            }
            // Toggle other lights randomly
            else {
              etoggle(elems[signals[i]], Math.random() > 0.7);
            }
          }
        }
        
        // Add visual effect during gear changes
        if (inGearChange) {
          // Flash the speedometer briefly on gear change
          if (speedo) {
            speedo.style.color = 'white';
            speedo.style.textShadow = '0 0 10px rgba(255,255,255,0.8)';
            
            // Reset style when gear change completes (no need for setTimeout)
            document.body.classList.add('gear-change');
          }
        } else {
          // Reset styles when not in gear change
          if (speedo) {
            speedo.style.color = '';
            speedo.style.textShadow = '';
          }
          document.body.classList.remove('gear-change');
        }
        
        // Add enhanced screen shake effect to animation container during gear changes
        if (inGearChange && animationContainer) {
          // Calculate shake intensity based on how far into the gear change we are
          const gearChangeProgress = (Date.now() - gearChangeTime) / GEAR_CHANGE_DURATION;
          
          // Stronger at the beginning, tapering off
          if (gearChangeProgress < 0.6) {
            const intensity = 3 * (1 - gearChangeProgress / 0.6);
            const offsetX = Math.sin(gearChangeProgress * 30) * intensity;
            const offsetY = Math.cos(gearChangeProgress * 20) * intensity * 0.5;
            
            animationContainer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
          } else {
            // Gradually reset position
            animationContainer.style.transform = 'translate(0, 0)';
          }
        }
      } else {
        // Original real data section
        // Update the data for CAN-only channels
        if (useCAN) {
          if (mapBoost) setText(mapBoost, mapFormat(canData.map));
          if (fuelPressure) setText(fuelPressure, canData.fuelPress);
          if (battLevel) setText(battLevel, canData.batt);
          if (lambda) setText(lambda, canData.lambda);
          if (oilPressure) setText(oilPressure, canData.oilPress);
        }
        
        // Update the data for Basic-only channels
        if (isBasicOnline) {
          if (fuelLevel) setText(fuelLevel, fuelLevelFormat(basicData, 'lvlFuel'));
          setFuelLevelBar(safeReturn(basicData, 'lvlFuel'));
          
          // Toggle signals
          for (let i = 0; i < signals.length; i++) {
            if (elems[signals[i]]) etoggle(elems[signals[i]], basicData[signals[i]]);
          }
        }
        
        // Update the data for channels that can be sourced from CAN or Basic
        updateRPM(useCANForRPM ? canData.rpm : safeReturn(basicData, 'rpm'));
        setKmhDeg(useCANForVSS ? [canData.vss] : [basicData.kmh, basicData.kmhF]);
        setCLTBar(useCANForCLT ? canData.clt : safeReturn(basicData, 'clt'));
        if (cltNow) setText(cltNow, useCANForCLT ? canData.clt : zeroFixed(safeReturn(basicData, 'clt')));
        
        if (kmTrip && kmTotal) {
          const odoValue = useCANForVSS ? canData.odoNow : basicData.odoNow;
          updateOdo(kmTotal, odoValue);
        }
      }
    } catch (e) {
      console.error('Error in bindRealtimeData:', e);
    }
    
    // Update the timestamps for chat messages
    updateChatTimestamps();
    
    // Request next frame for continuous updates
    requestAnimationFrame(bindRealtimeData);
  };
  
  // Update chat message timestamps to look more dynamic
  const updateChatTimestamps = () => {
    const timestamps = document.querySelectorAll('.timestamp');
    const options = ['just now', '1m ago', '2m ago', '3m ago', 'just now'];
    
    timestamps.forEach((timestamp, index) => {
      // Occasionally update timestamps to simulate active chat
      if (Math.random() < 0.01) { // 1% chance per frame
        const randomTime = options[Math.floor(Math.random() * options.length)];
        timestamp.textContent = randomTime;
      }
      
      // Always make the first timestamp "just now"
      if (index === 0) {
        timestamp.textContent = 'just now';
      }
    });
  };
  
  // Add periodic animation to mimic chat activity
  const initChatAnimations = () => {
    const chatMessages = document.querySelectorAll('.chat-message');
    
    // Function to add pulsing animation to a random chat message
    const pulseRandomMessage = () => {
      // Remove existing highlight class
      document.querySelectorAll('.highlight-message').forEach(el => {
        el.classList.remove('highlight-message');
      });
      
      // Add highlight to random message
      if (chatMessages.length > 0) {
        const randomIndex = Math.floor(Math.random() * chatMessages.length);
        chatMessages[randomIndex].classList.add('highlight-message');
      }
      
      // Schedule next pulse
      setTimeout(pulseRandomMessage, 3000 + Math.random() * 4000);
    };
    
    // Start the animations after a slight delay
    setTimeout(pulseRandomMessage, 5000);
  };
  
  // Start the chat animations
  setTimeout(initChatAnimations, 4000);
  
  // Add styling for highlighted messages
  (() => {
    const style = document.createElement('style');
    style.textContent = `
      .highlight-message {
        background-color: rgba(50, 50, 65, 0.8) !important;
        transition: background-color 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  })();
  
  // Replace the icons with the colored ones if specified in settings
  (() => {
    if (icon === 1) return;
    const iconElements = document.querySelectorAll('#top-info img');
    for (let i = 0; i < iconElements.length; i++) {
      iconElements[i].src = iconElements[i].src.replace('icons', 'icons_color');
    }
  })();
  
  // Add the RPM animation keyframes and gear change styles
  (() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes rpm-frame-advance {
        0% { transform: translateX(0); }
        100% { transform: translateX(-100%); }
      }
      
      @keyframes gearShake {
        0% { transform: translate(0, 0); }
        25% { transform: translate(-2px, 2px); }
        50% { transform: translate(2px, -2px); }
        75% { transform: translate(-2px, 0); }
        100% { transform: translate(0, 0); }
      }
      
      .gear-change .animation-container {
        animation: gearShake 0.6s ease-in-out;
      }
      
      body.gear-change {
        overflow-x: hidden; /* Ensure no scrollbar appears during shake */
      }
    `;
    document.head.appendChild(style);
  })();
  
  // Initialize animation and fallback image
  (() => {
    // Initialize the sprite with the first frame as fallback
    if (rpmSprite) {
      rpmSprite.style.backgroundPosition = '0% 0%';
      
      // Add fallback image handler
      rpmSprite.addEventListener('error', () => {
        console.warn('Sprite sheet failed to load. Using fallback.');
        rpmSprite.style.backgroundColor = '#333';
      });
    }
  })();
  
  // Start the animation timer
  animationStartTime = Date.now();
  
  // Start the simulation timer
  simulationStartTime = Date.now();
  
  // Wait for animations to finish and then open websocket connection
  setTimeout(() => openConnection(bindRealtimeData), 3500);
  
  // Ensure the container animation triggers properly
  setTimeout(() => {
    // Check if the container exists and add the animation class
    if (container) {
      container.classList.add('anim-in');
      console.log("Added anim-in class to container");
    }
  }, 100);
};

// Initialize the skin when the window loads
window.onload = callback;
