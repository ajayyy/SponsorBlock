/*
	This is based on code from VideoSegments.
	https://github.com/videosegments/videosegments/commits/f1e111bdfe231947800c6efdd51f62a4e7fef4d4/segmentsbar/segmentsbar.js
*/

'use strict';

let barTypes = {
	"undefined": {
		color: "#00d400",
		opacity: "0.5"
	},
	"sponsor": {
		color: "#00d400",
		opacity: "0.5"
	},
	"previewSponsor": {
		color: "#0000d4",
		opacity: "0.5"
	}
};

class PreviewBar {
	constructor(parent) {
		this.container = document.createElement('ul');
		this.container.id = 'previewbar';
		this.parent = parent;
		this.bars = []

		this.updatePosition();
	}

	updatePosition() {
		//below the seek bar
		// this.parent.insertAdjacentElement("afterEnd", this.container);
		
		//on the seek bar
		this.parent.insertAdjacentElement("afterBegin", this.container);
	}

	updateColor(segment, color, opacity) {
		let bars = document.querySelectorAll('[data-vs-segment-type=' + segment + ']');
		for (let bar of bars) {
			bar.style.backgroundColor = color;
			bar.style.opacity = opacity;
		}
	}

	set(timestamps, types, duration) {
		while (this.container.firstChild) {
			this.container.removeChild(this.container.firstChild);
		}

		if (!timestamps || !types) {
			return;
		}

		// to avoid rounding error resulting in width more than 100% 
		duration = Math.floor(duration * 100) / 100;
		let width;
		for (let i = 0; i < timestamps.length; i++) {
			if (types[i] == null) continue;

			width = (timestamps[i][1] - timestamps[i][0]) / duration * 100;
			width = Math.floor(width * 100) / 100;

			let bar = this.createBar();
			bar.setAttribute('data-vs-segment-type', types[i]);

			bar.style.backgroundColor = barTypes[types[i]].color;
			bar.style.opacity = barTypes[types[i]].opacity;
			bar.style.width = width + '%';
			bar.style.left = (timestamps[i][0] / duration * 100) + "%";
			bar.style.position = "absolute"

			this.container.insertAdjacentElement('beforeEnd', bar);
			this.bars[i] = bar;
		}
	}

	createBar() {
		let bar = document.createElement('li');
		bar.classList.add('previewbar');
		bar.innerHTML = '&nbsp;';
		return bar;
	}

	remove() {
		this.container.remove();
		this.container = undefined;
	}
}