// Copyright 2010 Chris Killpack. All Rights Reserved.

// TODOs:
// * Make proper classes for things and not just a bunch of Objects.
// * Make a general bind function to simplify binding instance methods to
//   jQuery event handlers.

var paint = {
  NUM_BRUSH_TYPES: 2,  // 0 = circle, 1 = splat
  MAX_BRUSH_SIZE: 20,

  init: function() {
    var canvas = document.getElementById('canvas');
    this.context_ = canvas.getContext('2d');

    this.mouseDown_ = false;
    this.brushRadius_ = 10;
    this.lastMousePos_ = new Point();

    this.clearRecordingBuffer_();
    this.imageData_ = this.selectImage_('image_0', this.context_);

    this.brushType_ = 0;  // circle

    // Setup image click handling
    var imageContainer = $('images');
    $('#images > img').each(function(i) {
      $(this).hover(function(event) {
        var top = event.pageY + 10;
        var left = event.pageX + 10;

        var info = imageInfo_[this.id];
        var hoverCardHtml = '<b>' + info.title + '<b>';
        hoverCardHtml += '<br><a href="' + info.url + '">' + info.url + '</a>';

        $('#hovercard')
            .css({top: paint.px_(top), left: paint.px_(left)})
            .html(hoverCardHtml)
            .fadeIn(200);
      }, function() {
        $('#hovercard').fadeOut(200);
      });
      $(this).click(function() {
        paint.imageData_ = paint.selectImage_(this.id, paint.context_);
        this.clearRecordingBuffer_();
      });
    });

    $('#recording').click(function() {
      paint.playbackRecording_();
    });

    // Bind to the appropriate events.
    $('#canvas')
    .mousedown(function(event) {
      paint.paintStart_(event);
    })
    .mouseup(function(event) {
      paint.paintEnd_();
    })
    .mousemove(function(event) {
      paint.paintMove_(event);
    })
    .bind('mousewheel', function(event, delta) {
      var radiusDelta = 0;
      if (event.wheelDelta) radiusDelta = event.wheelDelta / 120;
      paint.brushRadius_ = paint.brushRadius_ + radiusDelta;
      paint.brushRadius_ = paint.clamp_(paint.brushRadius_, 1,
                                        paint.MAX_BRUSH_SIZE);
      paint.drawBrush_();
    });

    // Initialize click handling on the brush tool
    $('#brush_canvas').click(function() {
      paint.cycleBrushType_();
    });

    // Draw the brush in the brush window.
    this.drawBrush_();
  },


  paintStart_: function(event) {
    var position = this.toCanvasCoords_(event);
    this.lastMousePos_.copyFrom(position);

    this.mouseDown_ = true;
    this.drawAction_(position, this.brushRadius_, this.imageData_);
  },


  paintEnd_: function() {
    this.mouseDown_ = false;
  },


  paintMove_: function(event) {
    if (!this.mouseDown_) {
      return;
    }

    var position = this.toCanvasCoords_(event);
    var delta = Point.subtract(position, this.lastMousePos_);
    this.lastMousePos_.copyFrom(position);

    this.drawAction_(position, this.brushRadius_, this.imageData_);
  },


  /**
   * Display a message in the text area for debugging purposes.
   * @param {string} msg The message to display.
   */
  debug_: function(msg) {
    document.getElementById('text').innerHTML = msg;
  },


  clearRecordingBuffer_: function() {
    this.recordingBuffer_ = new Array();
    this.updateRecordingUi_();
  },


  /**
   * Add a brush stroke to the recording buffer.
   * @param {Point} position The location of the brush stroke.
   * @param {Color} color The color of the brush stroke.
   * @param {number} radius The radius of the brush stroke.
   */
  recordBrushStroke_: function(position, color, radius) {
    if (this.recordingBuffer_ === undefined) {
      this.clearRecordingBuffer_();
    }
    var now = this.now_();

    // If this is the first sample, note down the start time
    if (this.recordingBuffer_.length === 0) {
      this.recordingStartTime_ = now;
    }
    this.recordingBuffer_.push({
      timestamp: now - this.recordingStartTime_,
      position: position,
      color: color,
      radius: radius});
  },


  updateRecordingUi_: function() {
    var html = this.recordingBuffer_.length.toString() + ' samples.';
    $('#recording').html(html);
  },


  playbackRecording_: function() {
  },


  /**
   * Draw the brush shape in the UI.
   */
  drawBrush_: function() {
    var context = document.getElementById('brush_canvas').getContext('2d');
    this.clearCanvas_(context);
    var canvas_center = new Point(context.canvas.width / 2,
                                  context.canvas.height / 2);
    var white = new Color(255, 255, 255);
    if (this.brushType_ == 0) {
      this.drawCircle_(canvas_center, this.brushRadius_, white, context);
    } else if (this.brushType_ == 1) {
      this.drawSplat_(canvas_center, this.brushRadius_, white, context);
    }
  },


  /**
   * Cycle to the next brush.
   */
  cycleBrushType_: function() {
    this.brushType_ = (this.brushType_ + 1) % this.NUM_BRUSH_TYPES;
    this.drawBrush_();
  },


  /**
   * @param {string} imageId The id of the image Element that was selected.
   * @param {CanvasRenderingContext2d} context The canvas rendering context.
   * @return {Object} imageData The image data.
   */
  selectImage_: function(imageId, context) {
    // Resize the canvas to the image size.
    var image = document.getElementById(imageId);
    var dimensions = paint.getImageDimensions_(image);
    context.canvas.width = dimensions.width;
    context.canvas.height = dimensions.height;

    // Draw the image into the canvas
    var imageData = paint.getImageData_(imageId, context);

    this.clearCanvas_(context);
    return imageData;
  },


  /**
   * Perform the draw 'action'.
   * @param {Point} position The position of the draw in canvas coordinates.
   * @param {number} radius The size of the brush.
   * @param {Object} imageData The image data.
   */
  drawAction_: function(position, radius, imageData) {
    var spread = radius * 1;

    for (var i = 0; i < 4 ; i++) {
      var point = new Point(parseInt(position.x + (paint.rand_() * spread)),
                            parseInt(position.y + (paint.rand_() * spread)));

      var image_pos = paint.toImageCoords_(point, this.context_, imageData);
      var color = paint.sampleImageColor_(image_pos, imageData);
      this.drawCircle_(point, radius, color);

      this.recordBrushStroke_(point, color, radius);
    }
    this.updateRecordingUi_();
  },


  /**
   * Retrieve the pixel data for the image.
   * @param {string} imageId The DOM id of the image to retrieve pixel data
   *   from.
   * @param {CanvasRenderingContext2d} context The canvas rendering context.
   * @return {Object} The image data
   *         {number} width The width of the image in pixels.
   *         {number} height The height of the image in pixels.
   *         {CanvasPixelArray} pixels The pixel data of the image.
   */
  getImageData_: function(imageId, context) {
    var image = document.getElementById(imageId);
    context.drawImage(image, 0, 0);
    var w = Math.min(image.width, context.canvas.width);
    var h = Math.min(image.height, context.canvas.height);
    data = context.getImageData(0, 0, w, h);
    return {
      width: image.width,
      height: image.height,
      pixels: data};
  },


  /**
   * Retrieve the dimensions of the image.
   * @param {Element} image The image element node.
   * @return {Size} The image dimensions.
   */
  getImageDimensions_: function(image) {
    return new Size(image.width, image.height);
  },


  /**
   * Clear the canvas to the specified color.
   * @param {CanvasRenderingContext2d} context The canvas rendering context.
   * @param {?string} opt_color The color to clear the canvas to. rgb(0,0,0)
   *   will be used if nothing is specified.
   */
  clearCanvas_: function(context, opt_color) {
    context.fillStyle = opt_color || "rgb(0,0,0)";
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  },


  /**
   * Return the color of a pixel in the image.
   * @param {Point} position The coordinates of the pixel.
   * @param {Object} imageData The image data.
   * @return {Color} The pixel color.
   */
  sampleImageColor_: function(position, imageData) {
    var offset = (position.x + (position.y * imageData.width)) * 4;
    var r = imageData.pixels.data[offset + 0];
    var g = imageData.pixels.data[offset + 1];
    var b = imageData.pixels.data[offset + 2];
    return new Color(r, g, b);
  },


  /**
   * Draw a circle on the canvas using the corresponding pixel in the image
   * data to specify the color.
   * @param {Point} position The location to draw the circle.
   * @param {number} size The radius of the circle.
   * @param {Color} color The color of the circle.
   * @param {?CanvasRenderingContext2d} opt_context The rendering context
   *     to use. If no context provided, it will use the member context.
   */
  drawCircle_: function(position, size, color, opt_context) {
    var context = opt_context || this.context_;
    context.beginPath();
    context.fillStyle = color.asString();
    context.arc(position.x, position.y, size, 0, 2 * Math.PI, false);
    context.fill();
  },


  drawSplat_: function(position, size, color, opt_context) {
    var context = opt_context || this.context_;

    // Draw the center
    this.drawCircle_(position, size, color, context);

    for (var arm = 0; arm < 4; arm++) {
      var angle = (arm / 4) * Math.PI * 2;
      var cs = Math.cos(angle);
      var sn = Math.sin(angle);

      // Build the vector (1,0) rotated by the angle. This will be the
      // line the splats lie along.
      var dx = cs;
      var dy = sn;
      var s2 = size;
      var step = 5;
      var distance = 10;
      for (var i = 0; i < 4; i++) {
        var x = dx * distance + position.x;
        var y = dy * distance + position.y;
        this.drawCircle_(new Point(x, y), s2, color, context);

        distance += step;
        step = step / 1.5;
        s2 = s2 / 2;
      }
    }
  },


  /**
   * Transform the mouse coordinates in the event into canvas space.
   * @param {Event} event The event object generated by the mouse event.
   * @return {Point} The point in canvas space.
   */
  toCanvasCoords_: function(event) {
    var offset = $(event.target).offset();
    return new Point(event.pageX - offset.left,
                     event.pageY - offset.top);
  },


  /**
   * Map a point in canvas space to image space.
   * @param {Point} position The point in canvas space.
   * @param {CanvasRenderingContext2d} context The canvas rendering context.
   * @param {Object} imageData The image data.
   * @return {Point} The corresponding point in image space.
   */
  toImageCoords_: function(position, context, imageData) {
    var sx = paint.clamp_(position.x / context.canvas.width, 0, 1);
    var sy = paint.clamp_(position.y / context.canvas.height, 0, 1);
    return new Point(parseInt(sx * imageData.width),
                     parseInt(sy * imageData.height));
  },


  /**
   * Clamp a value to a range.
   * @param {number} x Value to be clamped.
   * @param {number} min Lower limit.
   * @param {number} max Upper limit.
   */
  clamp_: function(x, min, max) {
    return Math.max(min, Math.min(max, x));
  },


  /**
   * Generate a random number in the range [-1,1]
   * @return {number} A random number.
   */
  rand_: function() {
    return (Math.random() - 0.5) * 2;
  },


  /**
   * Convert a number into a CSS px unit string.
   * @param {number} x The value to convert.
   * @return {string} The value as a string formatted in CSS px units.
   */
  px_: function(x) {
    return x.toString() + 'px';
  },


  /**
   * Returns the current time in milliseconds.
   * @return {number} The current wall time in milliseconds.
   */
  now_: function() {
    return new Date().getTime();
  }
}


/**
 * A Color class to simplify handling of colors.
 */
function Color(r, g, b) {
  this.set(r, g, b);
}


/**
 * Set the color.
 * @param {number} r The red component.
 * @param {number} g The green component.
 * @param {number} b The blue component.
 */
Color.prototype.set = function(r, g, b) {
  this.r = r;
  this.g = g;
  this.b = b;
};


Color.prototype.asString = function() {
  return "rgb(" + this.r + "," + this.g + "," + this.b + ")";
};


/**
 * A simple 2D point class
 * @param {?number} opt_x The x coordinate of the point.
 * @param {?number} opt_y The y coordinate of the point.
 */
function Point(opt_x, opt_y) {
  this.x = opt_x || 0;
  this.y = opt_y || 0;
}


/**
 * Set the components of the point to new values.
 * @param {number} x The new x coordinate.
 * @param {number} y The new y coordinate.
 */
Point.prototype.set = function(x, y) {
  this.x = x;
  this.y = y;
};


/**
 * Duplicate the components of another point into this one.
 * @param {Point} p The point whose components will be duplicated.
 */
Point.prototype.copyFrom = function(p) {
  this.x = p.x;
  this.y = p.y;
};


/**
 * Subtract two points and return the result in a new Point.
 * @param {Point} Point A.
 * @param {Point} Point B.
 * @return {Point} The result of A - B.
 */
Point.subtract = function(a, b) {
  return new Point(a.x - b.x, a.y - b.y);
};


/**
 * A simple 2D Size class that represents dimensions as opposed to a specific
 * point.
 * @param {number} width The width component of the size.
 * @param {number} height The height component of the size.
 */
function Size(width, height) {
  this.width = width;
  this.height = height;
}