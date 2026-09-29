class ShuffleDeck {
  constructor() {
    this.originalList = [];
    this.deck = [];
    this.historyStack = [];
    this.historyIndex = -1;
    this.isShuffle = true;
    this.seenThisCycle = new Set();
    this.maxHistory = 500;
  }

  setImages(fileList) {
    this.originalList = [...fileList];
    this.historyStack = [];
    this.historyIndex = -1;
    this.seenThisCycle.clear();
    this.rebuildRemainingDeck();
  }

  rebuildRemainingDeck() {
    this.deck = this.originalList.filter((image) => !this.seenThisCycle.has(image));
    if (this.isShuffle) this.shuffleArray(this.deck);
    else this.deck.reverse(); // pop() now returns the first image.
  }

  setShuffle(enabled) {
    if (this.isShuffle === enabled) return;
    this.isShuffle = enabled;
    this.rebuildRemainingDeck();
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  getNextImage() {
    if (!this.originalList.length) return null;
    if (this.historyIndex < this.historyStack.length - 1) {
      this.historyIndex++;
      return this.historyStack[this.historyIndex];
    }

    if (!this.deck.length) {
      const lastImage = this.historyStack[this.historyStack.length - 1];
      this.seenThisCycle.clear();
      this.rebuildRemainingDeck();
      if (this.isShuffle && this.deck.length > 1 && this.deck[this.deck.length - 1] === lastImage) {
        [this.deck[0], this.deck[this.deck.length - 1]] =
          [this.deck[this.deck.length - 1], this.deck[0]];
      }
    }

    const nextImage = this.deck.pop();
    this.seenThisCycle.add(nextImage);
    this.historyStack.push(nextImage);
    if (this.historyStack.length > this.maxHistory) this.historyStack.shift();
    this.historyIndex = this.historyStack.length - 1;
    return nextImage;
  }

  getPrevImage() {
    if (this.historyIndex <= 0) return null;
    this.historyIndex--;
    return this.historyStack[this.historyIndex];
  }

  discardImage(image) {
    this.originalList = this.originalList.filter((item) => item !== image);
    this.deck = this.deck.filter((item) => item !== image);
    this.seenThisCycle.delete(image);
    const removedBeforeCurrent = this.historyStack
      .slice(0, this.historyIndex + 1).filter((item) => item === image).length;
    this.historyStack = this.historyStack.filter((item) => item !== image);
    this.historyIndex = Math.max(-1, this.historyIndex - removedBeforeCurrent);
  }

  getCurrentIndex() {
    if (this.historyIndex < 0) return 0;
    return this.originalList.indexOf(this.historyStack[this.historyIndex]) + 1;
  }

  getTotalCount() {
    return this.originalList.length;
  }
}

window.ShuffleDeck = ShuffleDeck;
