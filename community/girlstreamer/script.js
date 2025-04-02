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
  const TOTAL_FRAMES = 23; // Number of frames in the sprite sheet
  const SPRITE_WIDTH = 11270; // Total width of the sprite sheet in pixels
  const FRAME_WIDTH = SPRITE_WIDTH / TOTAL_FRAMES; // Width of each frame
  
  // Animation ranges configuration
  const LOW_RPM_RANGE = { min: 0, max: 2000, frames: { start: 0, end: 6 } }; // Frames 1-7 (0-indexed)
  const MID_RPM_RANGE = { min: 2000, max: 4500 };
  const HIGH_RPM_RANGE = { min: 4500, max: 6000, frames: { start: 10, end: 22 } }; // Frames 11-23 (0-indexed)
  
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
    loadOdo(kmTotalSetting, 0, 0);
  }
  
  // Control the sprite frame based on RPM ratio and RPM value
  const updateSpriteFrame = (rpmRatio, rpm) => {
    if (!rpmSprite) return; // Guard clause to prevent errors
    
    let frameIndex;
    const currentTime = Date.now();
    const elapsedTime = currentTime - animationStartTime;
    
    if (rpm < LOW_RPM_RANGE.max) {
      // Below 2000 RPM: Ping-pong between frames 1-7
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
      // 4500+ RPM: Ping-pong between frames 11-23
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
      if (kmTrip && kmTotal) updateOdo(kmTotal, kmTrip, useCANForVSS ? canData.odoNow : basicData.odoNow);
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
  
  // Add the RPM animation keyframes dynamically to the document
  (() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes rpm-frame-advance {
        0% { transform: translateX(0); }
        100% { transform: translateX(-100%); }
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
