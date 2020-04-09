/*
	This is based on code from VideoSegments.
	https://github.com/videosegments/videosegments/commits/f1e111bdfe231947800c6efdd51f62a4e7fef4d4/segmentsbar/segmentsbar.js
*/

'use strict';

let barTypes = {
	"undefined": {
		color: "#00d400",
		opacity: "0.7"
	},
	"sponsor": {
		color: "#00d400",
		opacity: "0.7"
	},
	"preview-sponsor": {
		color: "#007800",
		opacity: "0.7"
	},
	"intro": {
		color: "#00ffff",
		opacity: "0.7"
	},
	"preview-intro": {
		color: "#008080",
		opacity: "0.7"
	},
	"outro": {
		color: "#0202ed",
		opacity: "0.7"
	},
	"preview-outro": {
		color: "#000070",
		opacity: "0.7"
	},
	"interaction": {
		color: "#cc00ff",
		opacity: "0.7"
	},
	"preview-interaction": {
		color: "#6c0087",
		opacity: "0.7"
	},
	"selfpromo": {
		color: "#ffff00",
		opacity: "0.7"
	},
	"preview-selfpromo": {
		color: "#bfbf35",
		opacity: "0.7"
	},
	"offtopic": {
		color: "#ff9900",
		opacity: "0.7"
	},
	"preview-offtopic": {
		color: "#a6634a",
		opacity: "0.7"
	}
};

class PreviewBar {
	container: HTMLUListElement;
	parent: any;
	onMobileYouTube: boolean;

	constructor(parent, onMobileYouTube) {
		this.container = document.createElement('ul');
		this.container.id = 'previewbar';
		this.parent = parent;

		this.onMobileYouTube = onMobileYouTube;

		this.updatePosition(parent);
	}

	updatePosition(parent) {
		//below the seek bar
		// this.parent.insertAdjacentElement("afterEnd", this.container);

		this.parent = parent;

		if (this.onMobileYouTube) {
			parent.style.backgroundColor = "rgba(255, 255, 255, 0.3)";
			parent.style.opacity = "1";
			
			this.container.style.transform = "none";
		}
		
		//on the seek bar
		this.parent.insertAdjacentElement("afterBegin", this.container);
	}

	updateColor(segment, color, opacity) {
		let bars = <NodeListOf<HTMLElement>> document.querySelectorAll('[data-vs-segment-type=' + segment + ']');
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
			if (!this.onMobileYouTube) bar.style.opacity = barTypes[types[i]].opacity;
			bar.style.width = width + '%';
			bar.style.left = (timestamps[i][0] / duration * 100) + "%";
			bar.style.position = "absolute"

			this.container.insertAdjacentElement("beforeend", bar);
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

export default PreviewBar;