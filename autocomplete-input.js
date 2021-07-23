/*

<autocomplete-input>

Drop-in replacement for datalist inputs (which are standard, but have weird
behavior in Safari). Use as:

<autocomplete-input list="counties"></autocomplete-input>
<datalist id="counties">
  <option>Option 1</option>
  <option>Option 2</option>
  <option>Option 3</option>
</datalist>

*/

var styles = `
  :host {
    position: relative;
    display: block;
  }

  :host[hidden] {
    display: none;
  }

  * {
    box-sizing: border-box;
  }

  input {
    display: block;
    width: 100%;
  }

  .dropdown {
    position: absolute;
    width: 100%;
    margin: 0;
    padding: 0;
    max-height: 180px;
    list-style-type: none;
    z-index: 999;
    overflow-y: auto;
  }

  .above .dropdown {
    bottom: 100%;
  }

  .dropdown li {
    padding: 2px 4px;
    background: white;
    border-bottom: 1px solid #DDD;
    text-align: left;
    cursor: pointer;
  }

  .dropdown .selected {
    background: #DDD;
  }
`;

var guid = 0;

export class AutocompleteInput extends HTMLElement {
  constructor() {
    super();

    var autoBind = [
      "onMenuClick",
      "onMenuTouch",
      "onBlur",
      "onInput",
      "onKeyPress",
      "onMutation",
      "closeMenu",
    ];
    // Binds an AutoComplete object to the its own methods so that, e.g., if
    // we try to access this.selectedIndex inside onMenuClick, we get a value
    // instead of undefined.
    autoBind.forEach(f => (this[f] = this[f].bind(this)));

    var id = guid++;

    // Watch for changes in the DOM
    this.observer = new MutationObserver(this.onMutation);

    this.list = null;             // ul node representing list of entires
    this.entries = [];
    this.selectedIndex = -1;
    this.value = null;            // Current selection
    this.cancelBlur = false;

    // Attach a shadow DOM tree to our custom component in a way that its
    // elements can be accessed with outside JS, i.e., Element.shadowRoot.
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
<style>${styles}</style>
<div 
  as="container"
  role="combobox"
  aria-haspopup="listbox"
  aria-owns="listbox-${id}"
>
  <input aria-controls="listbox-${id}" aria-activedescendant as="input">
  <ul 
    as="menuElement"
    id="listbox-${id}"
    role="listbox"
    class="dropdown">
  </ul>
</div>
    `;

    // Create new properties that point to inner HTML elements: this.container,
    // this.input, this.menuElement
    var tagged = this.shadowRoot.querySelectorAll("[as]");
    for (var t of tagged) {
      var name = t.getAttribute("as");
      this[name] = t;
    }

    var bounce = null;
    // debounce the inputs
    this.input.addEventListener("input", e => {
      if (bounce) {
        clearTimeout(bounce);
      }
      bounce = setTimeout(() => {
        bounce = null;
        this.onInput();
      }, 150);
    });
    // don't debounce arrow keys
    this.input.addEventListener("keydown", this.onKeyPress);
    this.input.addEventListener("blur", this.onBlur);

    this.menuElement.addEventListener("click", this.onMenuClick);
    this.menuElement.addEventListener("mousedown", this.onMenuTouch);
    this.menuElement.addEventListener("touchstart", this.onMenuTouch);
  }

  /**
   *  Lifecycle callback: On being appended to a document's DOM
   */
  connectedCallback() {
    if (document.readyState != "complete") {
      document.addEventListener("load", () => {
        // Find specified list of entries
        var id = this.getAttribute("list");
        if (!this.list && id) this.attributeChangedCallback("list", id, id);
      });
    }
  }

  /**
   *  Gets current selection
   */
  get value() {
    return this.input ? this.input.value : "";
  }

  /**
   *  Sets selected value
   */
  set value(v) {
    if (this.input) {
      var updated = this.input.value != v;
      // If different from current selection
      if (updated) {
        this.input.value = v;
        var changeEvent = new CustomEvent("change", {
          composed: true,
          bubbles: true,
        });
        this.dispatchEvent(changeEvent);
      }
    }
  }

  /**
   *  Specifies which attribute(s) whose change we want to watch
   *
   *  Right now, only watch for changes in which list to use
   */
  static get observedAttributes() {
    return ["list"];
  }

  /**
   *  Lifecycle callback: On a watched attribute being changed
   */
  attributeChangedCallback(attr, was, is) {
    switch (attr) {
      case "list":
        // un-observe the old list
        if (this.list) {
          this.observer.disconnect();
          this.list = null;
        }
        // find and monitor the list using its id
        this.list = document.querySelector("#" + is);
        if (this.list) {
          // Look for child addition and character mutation within the ul node
          this.observer.observe(this.list, {
            childList: true,
            characterData: true,
          });
          // update with existing items
          this.updateListEntries();
        }
        break;
    }
  }

  /**
   *  Event callback: On changes to ul node
   */
  onMutation(e) {
    this.updateListEntries();
  }

  /**
   *  Extracts entries from new li nodes 
   */
  updateListEntries() {
    if (!this.list) return;
    this.entries = Array.from(this.list.children)
      .map(function (option, index) {
        if (!option.value) return;
        return {
          value: option.value,
          label: option.innerHTML,
          index,
        };
      })
      .filter(v => v);
  }

  /**
   *  Event callback (debounced): On changes to text input
   */
  onInput() {
    var value = this.input.value;
    // Clear menu before appending
    this.menuElement.innerHTML = "";
    if (!value) return;
    var matcher = new RegExp(value, "i");
    //console.log(this.entries)
    var matching = this.entries.filter(e => e.label.match(matcher));
    // Do nothing if nothing matches
    if (!matching.length) return;

    // limit the matches
    matching = matching.slice(0, 100);
    var found = matching.find(r => r.index == this.selectedIndex);
    if (!found) this.selectedIndex = matching[0].index;
    // Show matches as suggestions
    var listItems = matching.forEach(entry => {
      var li = document.createElement("li");
      li.dataset.index = entry.index;
      li.dataset.value = entry.value;
      li.innerHTML = entry.label;
      li.setAttribute("role", "option");
      li.id = `list-${guid}-item-${entry.index}`;
      if (entry.index == this.selectedIndex) {
        li.classList.add("selected");
        this.input.setAttribute("aria-activedescendant", li.id);
      }
      this.menuElement.appendChild(li);
    });

    // Where to show suggestions? Below text input only if there's enough space
    var position = this.input.getBoundingClientRect();
    var below = window.innerHeight - position.bottom;
    this.container.classList.toggle(
      "above",
      below < this.menuElement.offsetHeight
    );
    this.container.setAttribute("aria-expanded", "true");
  }

  /**
   *  Event callback: On a key being pressed
   * 
   *  Up/Down: move between options/suggestions
   *  Enter: select current option
   *  Escape: close suggestions
   */
  onKeyPress(e) {
    switch (e.code) {
      case "ArrowDown":
      case "ArrowUp":
        var shift = e.code == "ArrowDown" ? 1 : -1;
        var current = this.menuElement.querySelector(".selected");
        var newIndex;
        if (current) {
          var currentIndex = Array.from(this.menuElement.children).indexOf(
            current
          );
          // Get remainder because we want to cycle through suggestions
          var newIndex =
            (currentIndex + shift) % this.menuElement.children.length;
          if (newIndex < 0)
            newIndex = this.menuElement.children.length + newIndex;
          current.classList.remove("selected");
        } else {
          newIndex = shift == 1 ? 0 : this.menuElement.children.length - 1;
        }
        var li = this.menuElement.children[newIndex];
        if (li) {
          li.classList.add("selected");
          this.input.setAttribute("aria-activedescendant", li.id);
          this.selectedIndex = li.dataset.index;
        }
        break;

      case "Enter":
        var chosen = this.entries[this.selectedIndex];
        if (!chosen) return;
        this.setValue(chosen);
        break;

      case "Escape":
        this.input.value = "";
        this.closeMenu();
        break;
    }
  }

  /**
   *  Set current suggestion as selection
   */
  setValue(entry) {
    if (entry) {
      this.input.value = entry.label;
      // Clear menu now that user has finished selecting
      this.menuElement.innerHTML = "";
      this.value = this.input.value;

      var changeEvent = new CustomEvent("change", {
        composed: true,
        bubbles: true,
      });
      this.dispatchEvent(changeEvent);

      var inputEvent = new CustomEvent("input", {
        composed: true,
        bubbles: true,
      });
      this.dispatchEvent(inputEvent);
    } else {
      this.input.value = "";
    }
    this.closeMenu();
  }

  /**
   *  Event callback: On user clicking on a suggestion
   */
  onMenuClick(e) {
    // console.log("click");
    var index = e.target.dataset.index;
    if (index == null) return;
    this.menuElement.innerHTML = "";
    this.selectedIndex = index;
    var entry = this.entries[index];
    this.setValue(entry);
  }

  /**
   *  Event calllback: On user tapping/pressing (but not yet clicking) on the menu
   */
  onMenuTouch() {
    // console.log("touch");
    // Don't blur because we don't want to close before onMenuClick is called
    this.cancelBlur = true;
  }

  /**
   *  Event callback: On user focusing elsewhere
   */
  onBlur() {
    // console.log("blur");
    if (this.cancelBlur) return;
    this.closeMenu();
  }

  /**
   *  Close the menu
   */
  closeMenu() {
    // console.log("close");
    this.menuElement.innerHTML = "";
    this.container.setAttribute("aria-expanded", "false");
    this.input.setAttribute("aria-activedescendant", "");
    this.cancelBlur = false;
  }
}

try {
  customElements.define("autocomplete-input", AutocompleteInput);
} catch (err) {
  console.log("AutocompleteInput couldn't be (re)defined");
}

export default AutocompleteInput;
